import { BadRequestException } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { Request, Response } from 'express';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController Idempotency-Key header', () => {
  const service = { sendNotification: jest.fn() };
  const controller = new NotificationsController(
    service as unknown as NotificationsService,
  );

  const request = {
    user: { tenantId: 'tenant-1', projectId: 'project-1' },
  } as unknown as Request & {
    user: { tenantId: string; projectId?: string };
  };
  const response = { setHeader: jest.fn() };

  const dto: SendNotificationDto = {
    recipientId: 'customer-1',
    title: 'Hello',
    body: 'World',
    channel: ChannelType.IN_APP,
  };

  function send(idempotencyKey: string | undefined) {
    return controller.create(
      request,
      response as unknown as Response,
      'tenant-1',
      undefined,
      idempotencyKey,
      dto,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service.sendNotification.mockResolvedValue({
      notification: { id: 'notification-1' },
      replayed: false,
    });
  });

  it('passes a trimmed key to the service', async () => {
    await send('  key-1  ');

    expect(service.sendNotification).toHaveBeenCalledWith(
      'tenant-1',
      'project-1',
      dto,
      'key-1',
    );
  });

  it('sends without a key when the header is absent', async () => {
    await expect(send(undefined)).resolves.toEqual({ id: 'notification-1' });

    expect(service.sendNotification).toHaveBeenCalledWith(
      'tenant-1',
      'project-1',
      dto,
      undefined,
    );
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it.each([' ', 'k'.repeat(256)])(
    'rejects an empty or oversized key',
    async (key) => {
      await expect(send(key)).rejects.toBeInstanceOf(BadRequestException);
      expect(service.sendNotification).not.toHaveBeenCalled();
    },
  );

  it('marks a replayed response', async () => {
    service.sendNotification.mockResolvedValue({
      notification: { id: 'notification-1' },
      replayed: true,
    });

    await expect(send('key-1')).resolves.toEqual({ id: 'notification-1' });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Idempotent-Replayed',
      'true',
    );
  });
});
