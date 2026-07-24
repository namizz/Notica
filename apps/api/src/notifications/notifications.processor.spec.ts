import {
  ChannelType,
  DeliveryStatus,
  NotificationStatus,
} from '@prisma/client';
import { Job } from 'bullmq';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  NotificationJobData,
  NotificationsProcessor,
} from './notifications.processor';

describe('NotificationsProcessor delivery status', () => {
  const notification = { update: jest.fn() };
  const notificationDelivery = {
    create: jest.fn(),
    update: jest.fn(),
  };
  const deviceToken = { findMany: jest.fn(), delete: jest.fn() };
  const recipientUser = { findFirst: jest.fn() };
  const gateway = {
    sendLogToProject: jest.fn(),
    sendNotificationToRoom: jest.fn(),
  };
  const pushService = { sendPushNotification: jest.fn() };
  const emailService = { sendEmail: jest.fn() };

  const processor = new NotificationsProcessor(
    {
      notification,
      notificationDelivery,
      deviceToken,
      recipientUser,
    } as unknown as PrismaService,
    gateway as unknown as RealtimeGateway,
    pushService as unknown as PushService,
    emailService as unknown as EmailService,
  );

  const baseData: NotificationJobData = {
    notificationId: 'notification-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    recipientDbId: 'recipient-db-1',
    externalUserId: 'customer-1',
    title: 'Hello',
    body: 'World',
    channel: ChannelType.IN_APP,
  };

  function job(channel: ChannelType) {
    return {
      data: { ...baseData, channel },
      attemptsMade: 0,
    } as Job<NotificationJobData, unknown, string>;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    notification.update.mockResolvedValue({});
    notificationDelivery.create.mockResolvedValue({ id: 'delivery-1' });
    notificationDelivery.update.mockResolvedValue({});
  });

  it('marks an offline in-app attempt as skipped instead of delivered', async () => {
    gateway.sendNotificationToRoom.mockResolvedValue(0);

    await expect(processor.process(job(ChannelType.IN_APP))).resolves.toEqual({
      success: false,
      status: NotificationStatus.SENT,
    });
    expect(notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DeliveryStatus.SKIPPED }),
      }),
    );
  });

  it('records missing web-push subscriptions as a skipped failed delivery', async () => {
    deviceToken.findMany.mockResolvedValue([]);

    await expect(processor.process(job(ChannelType.WEB_PUSH))).resolves.toEqual(
      {
        success: false,
        status: NotificationStatus.FAILED,
      },
    );
    expect(notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DeliveryStatus.SKIPPED }),
      }),
    );
  });

  it('marks console email as simulated rather than delivered', async () => {
    recipientUser.findFirst.mockResolvedValue({ email: 'user@example.com' });
    emailService.sendEmail.mockResolvedValue({
      provider: 'console',
      delivered: false,
      simulated: true,
    });

    await expect(processor.process(job(ChannelType.EMAIL))).resolves.toEqual({
      success: true,
      status: NotificationStatus.SENT,
    });
    expect(notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'console',
          status: DeliveryStatus.SIMULATED,
        }),
      }),
    );
  });
});
