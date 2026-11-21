import {
  ChannelType,
  DeliveryStatus,
  NotificationStatus,
  SmsEncoding,
  SmsMessage,
  SmsStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { SmsOutboxService, SmsTransition } from './sms-outbox.service';

describe('SmsOutboxService', () => {
  const smsMessage = {
    findMany: jest.fn(),
    updateManyAndReturn: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  };
  const notification = {
    update: jest.fn(),
    findUnique: jest.fn(),
  };
  const notificationDelivery = { update: jest.fn() };
  const recipientUser = { findFirst: jest.fn() };
  const realtime = { sendLogToProject: jest.fn() };
  const webhooks = { publish: jest.fn() };

  const outbox = new SmsOutboxService(
    {
      smsMessage,
      notification,
      notificationDelivery,
      recipientUser,
    } as unknown as PrismaService,
    realtime as unknown as RealtimeGateway,
    webhooks as unknown as WebhooksService,
  );

  const sampleMessage: SmsMessage = {
    id: 'msg-1',
    tenantId: 't1',
    projectId: 'p1',
    notificationId: 'notif-1',
    deliveryId: 'del-1',
    gatewayDeviceId: 'dev-1',
    to: '+251911234567',
    text: 'Hello world',
    encoding: SmsEncoding.GSM7,
    parts: 1,
    simSlot: 0,
    status: SmsStatus.QUEUED,
    dispatchAttempts: 0,
    leaseUntil: null,
    expiresAt: new Date(Date.now() + 3600000),
    acceptedAt: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    recipientUser.findFirst.mockResolvedValue({ externalUserId: 'ext-user-1' });
    notification.update.mockResolvedValue({});
    notification.findUnique.mockResolvedValue({
      id: 'notif-1',
      tenantId: 't1',
      projectId: 'p1',
      channel: ChannelType.SMS,
      recipientUserId: 'recip-1',
      recipientUser: { externalUserId: 'ext-user-1' },
    });
    notificationDelivery.update.mockResolvedValue({});
    webhooks.publish.mockResolvedValue(undefined);
  });

  describe('forward-only state transitions', () => {
    it('transitions QUEUED -> ACCEPTED -> SENT -> DELIVERED', async () => {
      // 1. QUEUED -> ACCEPTED
      smsMessage.findFirst.mockResolvedValueOnce({
        ...sampleMessage,
        status: SmsStatus.QUEUED,
      });
      smsMessage.updateMany.mockResolvedValueOnce({ count: 1 });
      const acceptedMessage = {
        ...sampleMessage,
        status: SmsStatus.ACCEPTED,
        acceptedAt: new Date(),
      };
      smsMessage.findUniqueOrThrow.mockResolvedValueOnce(acceptedMessage);

      const res1 = await outbox.transition('msg-1', {
        kind: 'accepted',
        at: new Date(),
      });
      expect(res1?.status).toBe(SmsStatus.ACCEPTED);
      expect(realtime.sendLogToProject).toHaveBeenCalledWith(
        't1',
        'p1',
        expect.objectContaining({
          type: 'info',
          message: expect.stringContaining('accepted by the gateway phone'),
        }),
      );

      // 2. ACCEPTED -> SENT
      smsMessage.findFirst.mockResolvedValueOnce(acceptedMessage);
      smsMessage.updateMany.mockResolvedValueOnce({ count: 1 });
      const sentMessage = {
        ...acceptedMessage,
        status: SmsStatus.SENT,
        sentAt: new Date(),
      };
      smsMessage.findUniqueOrThrow.mockResolvedValueOnce(sentMessage);

      const res2 = await outbox.transition('msg-1', {
        kind: 'sent',
        at: new Date(),
      });
      expect(res2?.status).toBe(SmsStatus.SENT);
      expect(notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: NotificationStatus.SENT },
        }),
      );
      expect(webhooks.publish).toHaveBeenCalledWith(
        't1',
        'p1',
        'notification.sent',
        expect.anything(),
      );

      // 3. SENT -> DELIVERED
      smsMessage.findFirst.mockResolvedValueOnce(sentMessage);
      smsMessage.updateMany.mockResolvedValueOnce({ count: 1 });
      const deliveredMessage = {
        ...sentMessage,
        status: SmsStatus.DELIVERED,
        deliveredAt: new Date(),
      };
      smsMessage.findUniqueOrThrow.mockResolvedValueOnce(deliveredMessage);

      const res3 = await outbox.transition('msg-1', {
        kind: 'delivered',
        at: new Date(),
      });
      expect(res3?.status).toBe(SmsStatus.DELIVERED);
      expect(notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: NotificationStatus.DELIVERED },
        }),
      );
      expect(webhooks.publish).toHaveBeenCalledWith(
        't1',
        'p1',
        'notification.delivered',
        expect.anything(),
      );
    });

    it('rejects backwards transitions (e.g. ACCEPTED when already DELIVERED)', async () => {
      smsMessage.findFirst.mockResolvedValueOnce({
        ...sampleMessage,
        status: SmsStatus.DELIVERED,
      });

      const res = await outbox.transition('msg-1', {
        kind: 'accepted',
        at: new Date(),
      });
      expect(res).toBeNull();
      expect(smsMessage.updateMany).not.toHaveBeenCalled();
    });

    it('rejects late SENT when already DELIVERED', async () => {
      smsMessage.findFirst.mockResolvedValueOnce({
        ...sampleMessage,
        status: SmsStatus.DELIVERED,
      });

      const res = await outbox.transition('msg-1', {
        kind: 'sent',
        at: new Date(),
      });
      expect(res).toBeNull();
      expect(smsMessage.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('provisional failure override', () => {
    it('allows SENT to override GATEWAY_UNREACHABLE provisional failure', async () => {
      smsMessage.findFirst.mockResolvedValueOnce({
        ...sampleMessage,
        status: SmsStatus.FAILED,
        errorCode: 'GATEWAY_UNREACHABLE',
      });
      smsMessage.updateMany.mockResolvedValueOnce({ count: 1 });
      const sentMsg = {
        ...sampleMessage,
        status: SmsStatus.SENT,
        sentAt: new Date(),
      };
      smsMessage.findUniqueOrThrow.mockResolvedValueOnce(sentMsg);

      const res = await outbox.transition('msg-1', {
        kind: 'sent',
        at: new Date(),
      });
      expect(res?.status).toBe(SmsStatus.SENT);
      expect(notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: NotificationStatus.SENT },
        }),
      );
    });

    it('does not allow override if failure was permanent (e.g. RADIO_OFF)', async () => {
      smsMessage.findFirst.mockResolvedValueOnce({
        ...sampleMessage,
        status: SmsStatus.FAILED,
        errorCode: 'RADIO_OFF',
      });

      const res = await outbox.transition('msg-1', {
        kind: 'sent',
        at: new Date(),
      });
      expect(res).toBeNull();
      expect(smsMessage.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('CAS retry logic', () => {
    it('retries on concurrent conflict and succeeds', async () => {
      // First attempt: current status QUEUED, but updateMany matches 0 rows (raced)
      smsMessage.findFirst
        .mockResolvedValueOnce({ ...sampleMessage, status: SmsStatus.QUEUED })
        .mockResolvedValueOnce({ ...sampleMessage, status: SmsStatus.DISPATCHED });

      smsMessage.updateMany
        .mockResolvedValueOnce({ count: 0 }) // race conflict
        .mockResolvedValueOnce({ count: 1 }); // success on retry

      const acceptedMessage = {
        ...sampleMessage,
        status: SmsStatus.ACCEPTED,
        acceptedAt: new Date(),
      };
      smsMessage.findUniqueOrThrow.mockResolvedValueOnce(acceptedMessage);

      const res = await outbox.transition('msg-1', {
        kind: 'accepted',
        at: new Date(),
      });
      expect(res?.status).toBe(SmsStatus.ACCEPTED);
      expect(smsMessage.updateMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('lease', () => {
    it('leases QUEUED messages for the device and marks them DISPATCHED', async () => {
      smsMessage.findMany.mockResolvedValueOnce([{ id: 'msg-1' }, { id: 'msg-2' }]);
      smsMessage.updateManyAndReturn.mockResolvedValueOnce([
        { ...sampleMessage, id: 'msg-1', status: SmsStatus.DISPATCHED },
        { ...sampleMessage, id: 'msg-2', status: SmsStatus.DISPATCHED },
      ]);

      const leased = await outbox.lease('dev-1', 10);
      expect(leased).toHaveLength(2);
      expect(smsMessage.updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['msg-1', 'msg-2'] }, status: SmsStatus.QUEUED },
          data: expect.objectContaining({
            status: SmsStatus.DISPATCHED,
            dispatchAttempts: { increment: 1 },
          }),
        }),
      );
    });

    it('returns empty array when no candidates exist', async () => {
      smsMessage.findMany.mockResolvedValueOnce([]);
      const leased = await outbox.lease('dev-1', 10);
      expect(leased).toEqual([]);
      expect(smsMessage.updateManyAndReturn).not.toHaveBeenCalled();
    });
  });
});
