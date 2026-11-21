import { HttpStatus } from '@nestjs/common';
import { ChannelType, DeliveryStatus, NotificationStatus } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { ChannelRequestError } from '../channels/channel-errors';
import { ChannelRegistry } from '../channels/channel-registry';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EmailChannelHandler } from './email-channel.handler';
import { EmailSendError } from './email-provider.interface';
import { EmailService } from './email.service';

describe('EmailChannelHandler', () => {
  const registry = {
    register: jest.fn(),
  };
  const recipientUser = { findFirst: jest.fn() };
  const notification = { update: jest.fn() };
  const notificationDelivery = {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  };
  const realtime = { sendLogToProject: jest.fn() };
  const emailService = {
    isEnabled: jest.fn().mockReturnValue(true),
    providerName: jest.fn().mockReturnValue('smtp'),
    send: jest.fn(),
  };
  const webhooks = { publish: jest.fn() };

  const handler = new EmailChannelHandler(
    registry as unknown as ChannelRegistry,
    {
      recipientUser,
      notification,
      notificationDelivery,
    } as unknown as PrismaService,
    realtime as unknown as RealtimeGateway,
    emailService as unknown as EmailService,
    webhooks as unknown as WebhooksService,
  );

  const baseJob = {
    notificationId: 'notif-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    recipientDbId: 'recip-db-1',
    externalUserId: 'user-1',
    title: 'Hello',
    body: 'World',
    channel: ChannelType.EMAIL,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    notificationDelivery.create.mockResolvedValue({ id: 'delivery-1' });
    notificationDelivery.update.mockResolvedValue({});
    notificationDelivery.findFirst.mockResolvedValue(null);
    notification.update.mockResolvedValue({});
  });

  describe('prepare', () => {
    it('throws when recipient has no email', async () => {
      await expect(
        handler.prepare({
          tenantId: 't1',
          projectId: 'p1',
          recipient: { id: 'r1', email: null, emailSuppressedAt: null } as any,
          title: 'Hi',
          body: 'There',
        }),
      ).rejects.toThrow(ChannelRequestError);
    });

    it('throws when recipient email is suppressed', async () => {
      await expect(
        handler.prepare({
          tenantId: 't1',
          projectId: 'p1',
          recipient: {
            id: 'r1',
            email: 'test@example.com',
            emailSuppressedAt: new Date(),
          } as any,
          title: 'Hi',
          body: 'There',
        }),
      ).rejects.toThrow(ChannelRequestError);
    });
  });

  describe('deliver', () => {
    it('marks console email as simulated rather than delivered', async () => {
      recipientUser.findFirst.mockResolvedValue({
        id: 'recip-db-1',
        email: 'user@example.com',
      });
      emailService.send.mockResolvedValue({
        messageId: 'msg-console-1',
        provider: 'console',
        simulated: true,
      });

      const result = await handler.deliver(baseJob, 1);
      expect(result).toEqual({ success: true, status: NotificationStatus.SENT });
      expect(notificationDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'console',
            status: DeliveryStatus.SIMULATED,
          }),
        }),
      );
      expect(webhooks.publish).not.toHaveBeenCalled();
    });

    it('does not send an email twice if already completed on previous attempt', async () => {
      notificationDelivery.findFirst.mockResolvedValue({
        id: 'delivery-1',
        status: DeliveryStatus.SUCCESS,
      });

      const result = await handler.deliver(baseJob, 1);
      expect(result).toEqual({ success: true, status: NotificationStatus.DELIVERED });
      expect(emailService.send).not.toHaveBeenCalled();
      expect(notificationDelivery.create).not.toHaveBeenCalled();
    });

    it('sends email and publishes notification.sent webhook on success', async () => {
      recipientUser.findFirst.mockResolvedValue({
        id: 'recip-db-1',
        email: 'user@example.com',
      });
      emailService.send.mockResolvedValue({
        messageId: 'msg-123',
        provider: 'smtp',
        simulated: false,
      });

      const result = await handler.deliver(baseJob, 1);
      expect(result).toEqual({ success: true, status: NotificationStatus.SENT });
      expect(notificationDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'smtp',
            providerMessageId: 'msg-123',
            status: DeliveryStatus.SUCCESS,
          }),
        }),
      );
      expect(webhooks.publish).toHaveBeenCalledWith(
        'tenant-1',
        'project-1',
        'notification.sent',
        expect.objectContaining({
          notificationId: 'notif-1',
          channel: ChannelType.EMAIL,
          to: 'user@example.com',
          provider: 'smtp',
        }),
      );
    });

    it('throws UnrecoverableError and publishes notification.failed on permanent error', async () => {
      recipientUser.findFirst.mockResolvedValue({
        id: 'recip-db-1',
        email: 'user@example.com',
      });
      const permError = new EmailSendError('Mailbox does not exist', true);
      emailService.send.mockRejectedValue(permError);

      await expect(handler.deliver(baseJob, 1)).rejects.toThrow(UnrecoverableError);
      expect(notificationDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DeliveryStatus.FAILED }),
        }),
      );
      expect(webhooks.publish).toHaveBeenCalledWith(
        'tenant-1',
        'project-1',
        'notification.failed',
        expect.objectContaining({
          notificationId: 'notif-1',
          channel: ChannelType.EMAIL,
        }),
      );
    });

    it('rethrows transient errors without UnrecoverableError', async () => {
      recipientUser.findFirst.mockResolvedValue({
        id: 'recip-db-1',
        email: 'user@example.com',
      });
      const transientError = new EmailSendError('Connection timed out', false);
      emailService.send.mockRejectedValue(transientError);

      await expect(handler.deliver(baseJob, 1)).rejects.toThrow(EmailSendError);
      expect(webhooks.publish).not.toHaveBeenCalled();
    });
  });
});
