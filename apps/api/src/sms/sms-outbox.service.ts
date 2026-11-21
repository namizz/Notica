import { Injectable, Logger } from '@nestjs/common';
import {
  ChannelType,
  DeliveryStatus,
  NotificationStatus,
  SmsMessage,
  SmsStatus,
} from '@prisma/client';
import { maskPhone } from '../common/phone.util';
import { smsSettings } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActivityLogPayload,
  RealtimeGateway,
} from '../realtime/realtime.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WebhookEventType } from '../webhooks/webhook-events';
import { PROVISIONAL_FAILURE_CODES, WireMessage } from './sms-wire';

export type SmsTransition =
  | { kind: 'accepted'; at: Date }
  | { kind: 'sent'; at: Date }
  | { kind: 'delivered'; at: Date }
  | { kind: 'failed'; at: Date; code: string; message?: string };

const ALLOWED_FROM: Record<SmsTransition['kind'], SmsStatus[]> = {
  accepted: [SmsStatus.QUEUED, SmsStatus.DISPATCHED],
  sent: [SmsStatus.QUEUED, SmsStatus.DISPATCHED, SmsStatus.ACCEPTED],
  delivered: [
    SmsStatus.QUEUED,
    SmsStatus.DISPATCHED,
    SmsStatus.ACCEPTED,
    SmsStatus.SENT,
  ],
  failed: [
    SmsStatus.QUEUED,
    SmsStatus.DISPATCHED,
    SmsStatus.ACCEPTED,
    SmsStatus.SENT,
  ],
};

export function toWireMessage(message: SmsMessage): WireMessage {
  return {
    messageId: message.id,
    to: message.to,
    text: message.text ?? '',
    simSlot: message.simSlot,
    encoding: message.encoding,
    parts: message.parts,
    deliveryReport: true,
    expiresAt: message.expiresAt.toISOString(),
  };
}

/**
 * The SMS outbox and its state machine. Every status change goes through
 * `transition`, which moves states forward only, and then mirrors the result
 * onto the notification, the dashboard log, and customer webhooks.
 */
@Injectable()
export class SmsOutboxService {
  private readonly logger = new Logger(SmsOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly webhooks: WebhooksService,
  ) {}

  /**
   * Leases up to `limit` queued messages of a device for sending. A message
   * whose lease runs out before the phone accepts it is offered again.
   * Concurrent callers never lease the same message: the update re-checks the
   * QUEUED status under the row lock.
   */
  async lease(deviceId: string, limit = 50): Promise<SmsMessage[]> {
    const now = new Date();
    const candidates = await this.prisma.smsMessage.findMany({
      where: {
        gatewayDeviceId: deviceId,
        status: SmsStatus.QUEUED,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    if (candidates.length === 0) {
      return [];
    }

    const leased = await this.prisma.smsMessage.updateManyAndReturn({
      where: {
        id: { in: candidates.map((candidate) => candidate.id) },
        status: SmsStatus.QUEUED,
      },
      data: {
        status: SmsStatus.DISPATCHED,
        leaseUntil: new Date(now.getTime() + smsSettings().leaseSeconds * 1000),
        dispatchAttempts: { increment: 1 },
      },
    });
    return leased.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /**
   * Applies one status change. Returns the updated message, or null when the
   * change is not allowed from the current state (a late or repeated report).
   */
  async transition(
    messageId: string,
    change: SmsTransition,
    options: { deviceId?: string } = {},
  ): Promise<SmsMessage | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.prisma.smsMessage.findFirst({
        where: {
          id: messageId,
          ...(options.deviceId ? { gatewayDeviceId: options.deviceId } : {}),
        },
      });
      if (!current) {
        return null;
      }
      if (!this.isAllowed(current, change)) {
        return null;
      }

      // Compare-and-set on the status that was read, so two reports racing
      // for the same message cannot both apply.
      const result = await this.prisma.smsMessage.updateMany({
        where: { id: current.id, status: current.status },
        data: this.dataFor(current, change),
      });
      if (result.count === 1) {
        const updated = await this.prisma.smsMessage.findUniqueOrThrow({
          where: { id: current.id },
        });
        await this.mirror(updated, change);
        return updated;
      }
    }
    this.logger.warn(`SMS ${messageId}: gave up after concurrent updates`);
    return null;
  }

  private isAllowed(current: SmsMessage, change: SmsTransition) {
    if (ALLOWED_FROM[change.kind].includes(current.status)) {
      return true;
    }
    // A failure the server assumed (phone unreachable, expired) is overridden
    // by what the phone later reports it actually did.
    return (
      current.status === SmsStatus.FAILED &&
      change.kind !== 'failed' &&
      change.kind !== 'accepted' &&
      PROVISIONAL_FAILURE_CODES.includes(current.errorCode ?? '')
    );
  }

  private dataFor(current: SmsMessage, change: SmsTransition) {
    switch (change.kind) {
      case 'accepted':
        return {
          status: SmsStatus.ACCEPTED,
          acceptedAt: change.at,
          leaseUntil: null,
        };
      case 'sent':
        return {
          status: SmsStatus.SENT,
          acceptedAt: current.acceptedAt ?? change.at,
          sentAt: change.at,
          leaseUntil: null,
          failedAt: null,
          errorCode: null,
          errorMessage: null,
        };
      case 'delivered':
        return {
          status: SmsStatus.DELIVERED,
          acceptedAt: current.acceptedAt ?? change.at,
          sentAt: current.sentAt ?? change.at,
          deliveredAt: change.at,
          leaseUntil: null,
          failedAt: null,
          errorCode: null,
          errorMessage: null,
        };
      case 'failed':
        return {
          status: SmsStatus.FAILED,
          failedAt: change.at,
          leaseUntil: null,
          errorCode: change.code,
          errorMessage: change.message?.slice(0, 500) ?? null,
        };
    }
  }

  /** Reflects an SMS state change on the notification and tells the world. */
  private async mirror(message: SmsMessage, change: SmsTransition) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: message.notificationId },
      include: { recipientUser: { select: { externalUserId: true } } },
    });
    const masked = maskPhone(message.to);
    let logType: ActivityLogPayload['type'] = 'info';
    let logMessage = '';
    let webhook: WebhookEventType | null = null;

    switch (change.kind) {
      case 'accepted':
        logMessage = `SMS to ${masked} accepted by the gateway phone`;
        break;
      case 'sent':
        await this.prisma.notificationDelivery.update({
          where: { id: message.deliveryId },
          data: {
            status: DeliveryStatus.SUCCESS,
            sentAt: change.at,
            errorMessage: null,
          },
        });
        await this.setNotificationStatus(message, NotificationStatus.SENT);
        logType = 'success';
        logMessage = `SMS sent to ${masked} (${message.parts} part${message.parts === 1 ? '' : 's'})`;
        webhook = 'notification.sent';
        break;
      case 'delivered':
        await this.prisma.notificationDelivery.update({
          where: { id: message.deliveryId },
          data: {
            status: DeliveryStatus.SUCCESS,
            sentAt: message.sentAt,
            deliveredAt: change.at,
            errorMessage: null,
          },
        });
        await this.setNotificationStatus(message, NotificationStatus.DELIVERED);
        logType = 'success';
        logMessage = `SMS delivered to ${masked}`;
        webhook = 'notification.delivered';
        break;
      case 'failed':
        await this.prisma.notificationDelivery.update({
          where: { id: message.deliveryId },
          data: {
            status: DeliveryStatus.FAILED,
            errorMessage: `${change.code}${change.message ? `: ${change.message}` : ''}`.slice(0, 500),
          },
        });
        await this.setNotificationStatus(message, NotificationStatus.FAILED);
        logType = 'error';
        logMessage = `SMS to ${masked} failed: ${change.code}`;
        webhook = 'notification.failed';
        break;
    }

    this.realtime.sendLogToProject(message.tenantId, message.projectId, {
      timestamp: new Date(),
      type: logType,
      message: logMessage,
      notificationId: message.notificationId,
      recipientId: notification?.recipientUser.externalUserId,
      channel: ChannelType.SMS,
    });

    if (webhook) {
      await this.webhooks.publish(message.tenantId, message.projectId, webhook, {
        notificationId: message.notificationId,
        channel: ChannelType.SMS,
        recipientId: notification?.recipientUser.externalUserId ?? null,
        to: message.to,
        status: message.status,
        parts: message.parts,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        occurredAt: change.at.toISOString(),
      });
    }
  }

  private setNotificationStatus(message: SmsMessage, status: NotificationStatus) {
    return this.prisma.notification.update({
      where: { id: message.notificationId },
      data: { status },
    });
  }
}
