import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ChannelType,
  DeliveryStatus,
  NotificationStatus,
  SmsStatus,
} from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { ChannelRequestError } from '../channels/channel-errors';
import type {
  ChannelHandler,
  ChannelPrepareContext,
  ChannelReadiness,
  DeliveryOutcome,
  NotificationJobData,
} from '../channels/channel-handler.interface';
import { ChannelRegistry } from '../channels/channel-registry';
import { DeliveryLog } from '../channels/delivery-log';
import { maskPhone } from '../common/phone.util';
import { analyzeSms } from '../common/sms-segments.util';
import { smsProviderName, smsSettings } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { GatewayDispatcher } from './gateway/gateway-dispatcher.service';
import { GatewayPresenceService } from './gateway/gateway-presence.service';
import { GatewayRouter } from './gateway/gateway-router.service';

const STATUS_OUTCOME: Record<SmsStatus, NotificationStatus> = {
  QUEUED: NotificationStatus.PROCESSING,
  DISPATCHED: NotificationStatus.PROCESSING,
  ACCEPTED: NotificationStatus.PROCESSING,
  SENT: NotificationStatus.SENT,
  DELIVERED: NotificationStatus.DELIVERED,
  FAILED: NotificationStatus.FAILED,
};

/**
 * The SMS channel. With SMS_PROVIDER=gateway, messages go into the outbox
 * and paired Android phones send them; with `console` they are only logged.
 * Unset, the channel is off and nothing here runs.
 */
@Injectable()
export class SmsChannelHandler implements ChannelHandler, OnModuleInit {
  readonly channel = ChannelType.SMS;
  private readonly logger = new Logger(SmsChannelHandler.name);
  private readonly log: DeliveryLog;

  constructor(
    private readonly registry: ChannelRegistry,
    private readonly prisma: PrismaService,
    realtime: RealtimeGateway,
    private readonly router: GatewayRouter,
    private readonly dispatcher: GatewayDispatcher,
    private readonly presence: GatewayPresenceService,
    private readonly webhooks: WebhooksService,
  ) {
    this.log = new DeliveryLog(prisma, realtime);
  }

  onModuleInit() {
    this.registry.register(this);
  }

  isEnabled(): boolean {
    return smsProviderName() !== null;
  }

  providerName(): string | null {
    return smsProviderName();
  }

  async prepare(context: ChannelPrepareContext): Promise<void> {
    if (!context.recipient.phone) {
      throw new ChannelRequestError(
        HttpStatus.BAD_REQUEST,
        'RECIPIENT_HAS_NO_PHONE',
        'The recipient has no phone number. Pass "phone" in E.164 form (e.g. +251911234567) or identify the recipient with one.',
      );
    }

    const settings = smsSettings();
    const { parts, encoding } = analyzeSms(context.body);
    if (parts > settings.maxParts) {
      throw new ChannelRequestError(
        HttpStatus.BAD_REQUEST,
        'SMS_TOO_LONG',
        `The body needs ${parts} SMS parts (${encoding}); the limit is ${settings.maxParts}.`,
      );
    }

    if (smsProviderName() !== 'gateway') {
      return;
    }
    const devices = await this.router.activeDevices(context.projectId);
    if (devices.length === 0) {
      throw new ChannelRequestError(
        HttpStatus.CONFLICT,
        'NO_SMS_GATEWAY',
        'No SMS gateway phone is paired with this project. Pair one under Gateways in the dashboard.',
      );
    }

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const sentToday = await this.prisma.smsMessage.count({
      where: { projectId: context.projectId, createdAt: { gte: startOfDay } },
    });
    if (sentToday >= settings.dailyLimitPerProject) {
      throw new ChannelRequestError(
        HttpStatus.TOO_MANY_REQUESTS,
        'SMS_DAILY_LIMIT',
        `This project reached its limit of ${settings.dailyLimitPerProject} SMS per day (UTC).`,
      );
    }
  }

  async readiness(_tenantId: string, projectId: string): Promise<ChannelReadiness> {
    if (smsProviderName() === 'console') {
      return { ready: true, detail: 'Messages are logged by the server, not sent' };
    }
    const devices = await this.router.activeDevices(projectId);
    if (devices.length === 0) {
      return { ready: false, detail: 'No gateway phone is paired' };
    }
    const online = await this.presence.onlineIds(devices.map((d) => d.id));
    return {
      ready: true,
      detail: `${devices.length} phone(s) paired, ${online.size} online`,
    };
  }

  async deliver(job: NotificationJobData, attempt: number): Promise<DeliveryOutcome> {
    return smsProviderName() === 'console'
      ? this.deliverToConsole(job, attempt)
      : this.deliverToGateway(job, attempt);
  }

  private async recipientPhone(job: NotificationJobData) {
    const recipient = await this.prisma.recipientUser.findFirst({
      where: {
        id: job.recipientDbId,
        tenantId: job.tenantId,
        projectId: job.projectId,
      },
      select: { phone: true },
    });
    return recipient?.phone ?? null;
  }

  private async failPermanently(
    job: NotificationJobData,
    attempt: number,
    provider: string,
    message: string,
  ): Promise<never> {
    const delivery = await this.log.createDelivery(job.notificationId, provider, attempt);
    await this.prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: DeliveryStatus.FAILED, errorMessage: message },
    });
    await this.webhooks.publish(job.tenantId, job.projectId, 'notification.failed', {
      notificationId: job.notificationId,
      channel: ChannelType.SMS,
      recipientId: job.externalUserId,
      errorMessage: message,
    });
    throw new UnrecoverableError(message);
  }

  private async deliverToGateway(
    job: NotificationJobData,
    attempt: number,
  ): Promise<DeliveryOutcome> {
    // A retried job must never queue the same SMS twice.
    const existing = await this.prisma.smsMessage.findFirst({
      where: { notificationId: job.notificationId },
    });
    if (existing) {
      if (existing.status === SmsStatus.QUEUED && existing.gatewayDeviceId) {
        this.dispatcher.dispatchSoon(existing.gatewayDeviceId);
      }
      const status = STATUS_OUTCOME[existing.status];
      return { success: status !== NotificationStatus.FAILED, status };
    }

    const phone = await this.recipientPhone(job);
    if (!phone) {
      return this.failPermanently(
        job,
        attempt,
        'sms-gateway',
        'Recipient has no phone number.',
      );
    }

    const device = await this.router.pick(job.projectId);
    if (!device) {
      return this.failPermanently(
        job,
        attempt,
        'sms-gateway',
        'No SMS gateway phone is paired with this project.',
      );
    }

    const settings = smsSettings();
    const { encoding, parts } = analyzeSms(job.body);
    if (parts > settings.maxParts) {
      return this.failPermanently(
        job,
        attempt,
        `sms-gateway:${device.id}`,
        `Body needs ${parts} SMS parts; the limit is ${settings.maxParts}.`,
      );
    }

    // One write creates the delivery and its outbox row together.
    await this.prisma.notificationDelivery.create({
      data: {
        notificationId: job.notificationId,
        provider: `sms-gateway:${device.id}`,
        status: DeliveryStatus.PENDING,
        attemptCount: attempt,
        sms: {
          create: {
            tenantId: job.tenantId,
            projectId: job.projectId,
            notificationId: job.notificationId,
            gatewayDeviceId: device.id,
            to: phone,
            text: job.body,
            encoding,
            parts,
            simSlot: device.defaultSimSlot,
            expiresAt: new Date(Date.now() + settings.messageTtlMinutes * 60_000),
          },
        },
      },
    });

    this.dispatcher.dispatchSoon(device.id);
    this.log.log(
      job,
      'info',
      `SMS to ${maskPhone(phone)} queued for gateway "${device.name}" (${parts} part${parts === 1 ? '' : 's'}, ${encoding})`,
    );
    return { success: true, status: NotificationStatus.PROCESSING };
  }

  private async deliverToConsole(
    job: NotificationJobData,
    attempt: number,
  ): Promise<DeliveryOutcome> {
    if (await this.log.findCompletedDelivery(job.notificationId)) {
      await this.log.resumeCompleted(job, NotificationStatus.SENT);
      return { success: true, status: NotificationStatus.SENT };
    }

    const phone = await this.recipientPhone(job);
    if (!phone) {
      return this.failPermanently(job, attempt, 'sms-console', 'Recipient has no phone number.');
    }

    const { encoding, parts } = analyzeSms(job.body);
    this.logger.log(`[CONSOLE SMS] to: ${phone} | ${parts} part(s), ${encoding}\n${job.body}`);
    await this.prisma.notificationDelivery.create({
      data: {
        notificationId: job.notificationId,
        provider: 'sms-console',
        status: DeliveryStatus.SIMULATED,
        attemptCount: attempt,
        sentAt: new Date(),
      },
    });
    await this.log.setNotificationStatus(job.notificationId, NotificationStatus.SENT);
    this.log.log(job, 'warning', `SMS simulated in console for ${maskPhone(phone)}`);
    return { success: true, status: NotificationStatus.SENT };
  }
}
