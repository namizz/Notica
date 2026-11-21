import { HttpStatus } from '@nestjs/common';
import {
  ChannelType,
  DeliveryStatus,
  NotificationStatus,
  SmsEncoding,
  SmsStatus,
} from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { ChannelRequestError } from '../channels/channel-errors';
import { ChannelRegistry } from '../channels/channel-registry';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { GatewayDispatcher } from './gateway/gateway-dispatcher.service';
import { GatewayPresenceService } from './gateway/gateway-presence.service';
import { GatewayRouter } from './gateway/gateway-router.service';
import { SmsChannelHandler } from './sms-channel.handler';

describe('SmsChannelHandler', () => {
  const registry = { register: jest.fn() };
  const prisma = {
    recipientUser: { findFirst: jest.fn() },
    notification: { update: jest.fn() },
    notificationDelivery: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    smsMessage: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
  };
  const realtime = { sendLogToProject: jest.fn() };
  const router = {
    activeDevices: jest.fn(),
    pick: jest.fn(),
  };
  const dispatcher = {
    dispatchSoon: jest.fn(),
  };
  const presence = {
    isOnline: jest.fn(),
  };
  const webhooks = {
    publish: jest.fn(),
  };

  const handler = new SmsChannelHandler(
    registry as unknown as ChannelRegistry,
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeGateway,
    router as unknown as GatewayRouter,
    dispatcher as unknown as GatewayDispatcher,
    presence as unknown as GatewayPresenceService,
    webhooks as unknown as WebhooksService,
  );

  const baseJob = {
    notificationId: 'notif-sms-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    recipientDbId: 'recip-1',
    externalUserId: 'user-1',
    title: 'Alert',
    body: 'Your code is 123456',
    channel: ChannelType.SMS,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SMS_PROVIDER = 'gateway';
    prisma.notificationDelivery.create.mockResolvedValue({ id: 'delivery-1' });
    prisma.notificationDelivery.update.mockResolvedValue({});
    prisma.notification.update.mockResolvedValue({});
    prisma.smsMessage.count.mockResolvedValue(0);
  });

  describe('prepare', () => {
    it('throws RECIPIENT_HAS_NO_PHONE when recipient phone is missing', async () => {
      await expect(
        handler.prepare({
          tenantId: 't1',
          projectId: 'p1',
          recipient: { id: 'r1', phone: null } as any,
          title: 'Title',
          body: 'Hello',
        }),
      ).rejects.toThrow(ChannelRequestError);
    });

    it('throws NO_SMS_GATEWAY when no paired devices exist for gateway provider', async () => {
      router.activeDevices.mockResolvedValueOnce([]);

      await expect(
        handler.prepare({
          tenantId: 't1',
          projectId: 'p1',
          recipient: { id: 'r1', phone: '+251911234567' } as any,
          title: 'Title',
          body: 'Hello',
        }),
      ).rejects.toThrow(ChannelRequestError);
    });

    it('throws SMS_DAILY_LIMIT when daily project limit is exceeded', async () => {
      router.activeDevices.mockResolvedValueOnce([{ id: 'dev-1' }]);
      prisma.smsMessage.count.mockResolvedValueOnce(501);

      await expect(
        handler.prepare({
          tenantId: 't1',
          projectId: 'p1',
          recipient: { id: 'r1', phone: '+251911234567' } as any,
          title: 'Title',
          body: 'Hello',
        }),
      ).rejects.toThrow(ChannelRequestError);
    });

    it('passes when valid phone, active devices, and within limits', async () => {
      router.activeDevices.mockResolvedValueOnce([{ id: 'dev-1' }]);
      prisma.smsMessage.count.mockResolvedValueOnce(10);

      await expect(
        handler.prepare({
          tenantId: 't1',
          projectId: 'p1',
          recipient: { id: 'r1', phone: '+251911234567' } as any,
          title: 'Title',
          body: 'Hello',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('deliver', () => {
    it('does not re-queue on retry if SmsMessage already exists', async () => {
      prisma.smsMessage.findFirst.mockResolvedValueOnce({
        id: 'msg-existing-1',
        status: SmsStatus.QUEUED,
        gatewayDeviceId: 'dev-1',
      });

      const result = await handler.deliver(baseJob, 1);
      expect(result).toEqual({ success: true, status: NotificationStatus.PROCESSING });
      expect(prisma.notificationDelivery.create).not.toHaveBeenCalled();
      expect(dispatcher.dispatchSoon).toHaveBeenCalledWith('dev-1');
    });

    it('throws UnrecoverableError if recipient has no phone', async () => {
      prisma.smsMessage.findFirst.mockResolvedValueOnce(null);
      prisma.recipientUser.findFirst.mockResolvedValueOnce({ phone: null });

      await expect(handler.deliver(baseJob, 1)).rejects.toThrow(UnrecoverableError);
      expect(prisma.notificationDelivery.create).toHaveBeenCalled();
      expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DeliveryStatus.FAILED }),
        }),
      );
    });

    it('creates delivery and sms record, then triggers dispatch on success', async () => {
      prisma.smsMessage.findFirst.mockResolvedValueOnce(null);
      prisma.recipientUser.findFirst.mockResolvedValueOnce({ phone: '+251911234567' });
      router.pick.mockResolvedValueOnce({
        id: 'dev-1',
        defaultSimSlot: 0,
      });

      const result = await handler.deliver(baseJob, 1);
      expect(result).toEqual({ success: true, status: NotificationStatus.PROCESSING });
      expect(prisma.notificationDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'sms-gateway:dev-1',
            status: DeliveryStatus.PENDING,
            sms: expect.objectContaining({
              create: expect.objectContaining({
                gatewayDeviceId: 'dev-1',
                to: '+251911234567',
                text: 'Your code is 123456',
              }),
            }),
          }),
        }),
      );
      expect(dispatcher.dispatchSoon).toHaveBeenCalledWith('dev-1');
    });
  });
});
