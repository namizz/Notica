import {
  BadRequestException,
  Controller,
  Headers,
  Logger,
  Post,
  Req,
  Body,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DeliveryStatus, NotificationStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';

function verifySvix(
  rawBody: Buffer,
  svixId: string,
  svixTimestamp: string,
  svixSignatures: string,
  secret: string,
): boolean {
  const keyBase64 = secret.replace(/^whsec_/, '');
  const key = Buffer.from(keyBase64, 'base64');
  const signed = `${svixId}.${svixTimestamp}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', key).update(signed).digest('base64');
  return svixSignatures.split(' ').some((sig) => {
    const b64 = sig.replace(/^v1,/, '');
    try {
      return timingSafeEqual(Buffer.from(b64, 'base64'), Buffer.from(expected, 'base64'));
    } catch {
      return false;
    }
  });
}

interface ResendWebhookPayload {
  type: string;
  data: { email_id: string; to?: string[]; created_at?: string };
}

@SkipThrottle()
@Controller('webhooks/email')
export class EmailWebhooksController {
  private readonly logger = new Logger(EmailWebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly webhooks: WebhooksService,
  ) {}

  @Post('resend')
  async handleResend(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
    @Body() body: unknown,
  ) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn('RESEND_WEBHOOK_SECRET not configured; ignoring Resend webhook');
      return { ok: true };
    }

    const rawBody = req.rawBody;
    if (!rawBody || !svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException('Missing Svix headers or body');
    }

    if (!verifySvix(rawBody, svixId, svixTimestamp, svixSignature, secret)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = body as ResendWebhookPayload;
    const emailId = payload?.data?.email_id;
    if (!emailId) return { ok: true };

    const delivery = await this.prisma.notificationDelivery.findFirst({
      where: { providerMessageId: emailId },
      include: {
        notification: {
          include: { recipientUser: { select: { externalUserId: true, email: true } } },
        },
      },
    });

    if (!delivery) {
      this.logger.debug(`No delivery found for Resend email_id=${emailId}`);
      return { ok: true };
    }

    const { notification } = delivery;
    const recipientId = notification.recipientUser.externalUserId;
    const to = notification.recipientUser.email;

    switch (payload.type) {
      case 'email.delivered':
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { deliveredAt: new Date(), status: DeliveryStatus.SUCCESS },
        });
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.DELIVERED },
        });
        await this.webhooks.publish(notification.tenantId, notification.projectId, 'notification.delivered', {
          notificationId: notification.id, channel: notification.channel, recipientId, to,
        });
        break;

      case 'email.bounced':
        await this.prisma.recipientUser.update({
          where: { id: notification.recipientUserId },
          data: { emailSuppressedAt: new Date(), emailSuppressionReason: 'bounce' },
        });
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.FAILED },
        });
        await this.webhooks.publish(notification.tenantId, notification.projectId, 'notification.failed', {
          notificationId: notification.id, channel: notification.channel, recipientId, errorMessage: 'Email bounced',
        });
        await this.webhooks.publish(notification.tenantId, notification.projectId, 'email.bounced', {
          notificationId: notification.id, channel: notification.channel, recipientId, to,
        });
        break;

      case 'email.complained':
        await this.prisma.recipientUser.update({
          where: { id: notification.recipientUserId },
          data: { emailSuppressedAt: new Date(), emailSuppressionReason: 'complaint' },
        });
        await this.webhooks.publish(notification.tenantId, notification.projectId, 'email.complained', {
          notificationId: notification.id, channel: notification.channel, recipientId, to,
        });
        break;

      case 'email.delivery_delayed':
        this.logger.log(`Email delivery delayed for notification ${notification.id}`);
        break;

      default:
        this.logger.debug(`Unhandled Resend event type: ${payload.type}`);
    }
    return { ok: true };
  }
}
