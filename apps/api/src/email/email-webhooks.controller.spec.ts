import { BadRequestException } from '@nestjs/common';
import { ChannelType, DeliveryStatus, NotificationStatus } from '@prisma/client';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EmailWebhooksController } from './email-webhooks.controller';

describe('EmailWebhooksController (Svix)', () => {
  const prisma = {
    notificationDelivery: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      update: jest.fn(),
    },
    recipientUser: {
      update: jest.fn(),
    },
  };
  const realtime = { sendLogToProject: jest.fn() };
  const webhooks = { publish: jest.fn() };

  const controller = new EmailWebhooksController(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeGateway,
    webhooks as unknown as WebhooksService,
  );

  const secretRaw = 'test-secret-key-for-svix-testing';
  const secretBase64 = Buffer.from(secretRaw).toString('base64');
  const secret = `whsec_${secretBase64}`;

  function signPayload(bodyStr: string, svixId: string, svixTimestamp: string) {
    const key = Buffer.from(secretBase64, 'base64');
    const signed = `${svixId}.${svixTimestamp}.${bodyStr}`;
    const sig = createHmac('sha256', key).update(signed).digest('base64');
    return `v1,${sig}`;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = secret;
    prisma.notificationDelivery.update.mockResolvedValue({});
    prisma.notification.update.mockResolvedValue({});
    prisma.recipientUser.update.mockResolvedValue({});
    webhooks.publish.mockResolvedValue(undefined);
  });

  it('rejects invalid signature with BadRequestException', async () => {
    const rawBody = Buffer.from(JSON.stringify({ type: 'email.delivered' }));
    const req = { rawBody } as any;

    await expect(
      controller.handleResend(
        req,
        'msg_test_1',
        '1700000000',
        'v1,badsignature',
        { type: 'email.delivered' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts valid signature and handles email.delivered', async () => {
    const bodyObj = {
      type: 'email.delivered',
      data: { email_id: 'resend_msg_1' },
    };
    const bodyStr = JSON.stringify(bodyObj);
    const rawBody = Buffer.from(bodyStr);
    const svixId = 'msg_svix_123';
    const svixTimestamp = '1700000000';
    const sig = signPayload(bodyStr, svixId, svixTimestamp);

    prisma.notificationDelivery.findFirst.mockResolvedValueOnce({
      id: 'del-1',
      notification: {
        id: 'notif-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        channel: ChannelType.EMAIL,
        recipientUserId: 'recip-1',
        recipientUser: {
          externalUserId: 'cust-1',
          email: 'cust@example.com',
        },
      },
    });

    const res = await controller.handleResend(
      { rawBody } as any,
      svixId,
      svixTimestamp,
      sig,
      bodyObj,
    );

    expect(res).toEqual({ ok: true });
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-1' },
        data: expect.objectContaining({ status: DeliveryStatus.SUCCESS }),
      }),
    );
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notif-1' },
        data: { status: NotificationStatus.DELIVERED },
      }),
    );
    expect(webhooks.publish).toHaveBeenCalledWith(
      'tenant-1',
      'project-1',
      'notification.delivered',
      expect.anything(),
    );
  });

  it('handles email.bounced by suppressing recipient and failing notification', async () => {
    const bodyObj = {
      type: 'email.bounced',
      data: { email_id: 'resend_msg_2' },
    };
    const bodyStr = JSON.stringify(bodyObj);
    const rawBody = Buffer.from(bodyStr);
    const svixId = 'msg_svix_456';
    const svixTimestamp = '1700000001';
    const sig = signPayload(bodyStr, svixId, svixTimestamp);

    prisma.notificationDelivery.findFirst.mockResolvedValueOnce({
      id: 'del-2',
      notification: {
        id: 'notif-2',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        channel: ChannelType.EMAIL,
        recipientUserId: 'recip-2',
        recipientUser: {
          externalUserId: 'cust-2',
          email: 'bounce@example.com',
        },
      },
    });

    await controller.handleResend(
      { rawBody } as any,
      svixId,
      svixTimestamp,
      sig,
      bodyObj,
    );

    expect(prisma.recipientUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'recip-2' },
        data: expect.objectContaining({
          emailSuppressionReason: 'bounce',
        }),
      }),
    );
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notif-2' },
        data: { status: NotificationStatus.FAILED },
      }),
    );
    expect(webhooks.publish).toHaveBeenCalledWith(
      'tenant-1',
      'project-1',
      'email.bounced',
      expect.anything(),
    );
  });
});
