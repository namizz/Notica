import { UnprocessableEntityException } from '@nestjs/common';
import { ChannelType, NotificationStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NotificationsService } from './notifications.service';

describe('NotificationsService idempotency', () => {
  const project = { findFirst: jest.fn() };
  const recipientUser = { upsert: jest.fn() };
  const notification = { create: jest.fn(), findUnique: jest.fn() };
  const queue = { add: jest.fn() };

  const service = new NotificationsService(
    { project, recipientUser, notification } as unknown as PrismaService,
    queue as unknown as Queue,
  );

  const dto: SendNotificationDto = {
    recipientId: 'customer-1',
    title: 'Order shipped',
    body: 'Order #1002 is on its way.',
    channel: ChannelType.IN_APP,
  };

  const stored = {
    id: 'notification-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    recipientUserId: 'recipient-db-1',
    title: dto.title,
    body: dto.body,
    channel: dto.channel,
    status: NotificationStatus.PENDING,
    createdAt: new Date(),
    isRead: false,
    readAt: null,
    idempotencyKey: 'key-1',
  };

  const storedWithRecipient = {
    ...stored,
    recipientUser: { externalUserId: dto.recipientId },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    project.findFirst.mockResolvedValue({ id: 'project-1' });
    recipientUser.upsert.mockResolvedValue({
      id: 'recipient-db-1',
      externalUserId: dto.recipientId,
    });
    notification.create.mockResolvedValue(stored);
    notification.findUnique.mockResolvedValue(null);
    queue.add.mockResolvedValue({});
  });

  it('queues one job per notification, keyed by the notification id', async () => {
    const result = await service.sendNotification('tenant-1', 'project-1', dto);

    expect(result).toEqual({ notification: stored, replayed: false });
    expect(notification.findUnique).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(
      'send-notification',
      expect.objectContaining({ notificationId: 'notification-1' }),
      expect.objectContaining({ jobId: 'notification-1' }),
    );
  });

  it('stores the idempotency key on a first request', async () => {
    await service.sendNotification('tenant-1', 'project-1', dto, 'key-1');

    const [[createArgs]] = notification.create.mock.calls as [
      [{ data: { idempotencyKey?: string } }],
    ];
    expect(createArgs.data.idempotencyKey).toBe('key-1');
  });

  it('returns the original notification for a repeated key without sending again', async () => {
    notification.findUnique.mockResolvedValue({
      ...storedWithRecipient,
      status: NotificationStatus.SENT,
    });

    const result = await service.sendNotification(
      'tenant-1',
      'project-1',
      dto,
      'key-1',
    );

    expect(result).toEqual({
      notification: { ...stored, status: NotificationStatus.SENT },
      replayed: true,
    });
    expect(notification.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_idempotencyKey: {
            projectId: 'project-1',
            idempotencyKey: 'key-1',
          },
        },
      }),
    );
    expect(recipientUser.upsert).not.toHaveBeenCalled();
    expect(notification.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('re-enqueues a replayed notification that never left PENDING under the same job id', async () => {
    notification.findUnique.mockResolvedValue(storedWithRecipient);

    await service.sendNotification('tenant-1', 'project-1', dto, 'key-1');

    expect(queue.add).toHaveBeenCalledWith(
      'send-notification',
      expect.objectContaining({
        notificationId: 'notification-1',
        externalUserId: dto.recipientId,
      }),
      expect.objectContaining({ jobId: 'notification-1' }),
    );
  });

  it('rejects a reused key carrying a different notification', async () => {
    notification.findUnique.mockResolvedValue(storedWithRecipient);

    await expect(
      service.sendNotification(
        'tenant-1',
        'project-1',
        { ...dto, body: 'Something else' },
        'key-1',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(notification.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('answers a concurrent duplicate with the winning notification', async () => {
    notification.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...storedWithRecipient,
      status: NotificationStatus.PROCESSING,
    });
    notification.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const result = await service.sendNotification(
      'tenant-1',
      'project-1',
      dto,
      'key-1',
    );

    expect(result.replayed).toBe(true);
    expect(result.notification.id).toBe('notification-1');
    expect(queue.add).not.toHaveBeenCalled();
  });
});
