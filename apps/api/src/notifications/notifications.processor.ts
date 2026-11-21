import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ChannelType,
  DeliveryStatus,
  NotificationStatus,
} from '@prisma/client';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailDeliveryResult } from '../email/email-provider.interface';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export interface NotificationJobData {
  notificationId: string;
  tenantId: string;
  projectId: string;
  recipientDbId: string;
  externalUserId: string;
  title: string;
  body: string;
  channel: ChannelType;
}

interface PushError extends Error {
  statusCode?: number;
}

/**
 * Delivery outcomes that mean the provider was already handed the message.
 * A retried or stalled job that finds one of these must not send again.
 */
const COMPLETED_DELIVERY_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.SUCCESS,
  DeliveryStatus.SIMULATED,
  DeliveryStatus.SKIPPED,
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown delivery failure';
}

function pushError(error: unknown): PushError {
  return error instanceof Error ? error : new Error(String(error));
}

@Processor('notification-delivery')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly pushService: PushService,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  async process(
    job: Job<NotificationJobData, unknown, string>,
  ): Promise<{ success: boolean; status: NotificationStatus }> {
    const data = job.data;
    await this.prisma.notification.update({
      where: { id: data.notificationId },
      data: { status: NotificationStatus.PROCESSING },
    });

    this.realtimeGateway.sendLogToProject(data.tenantId, data.projectId, {
      timestamp: new Date(),
      type: 'info',
      message: `Processing notification ${data.notificationId.slice(0, 8)} (${data.channel})`,
      notificationId: data.notificationId,
      recipientId: data.externalUserId,
      channel: data.channel,
    });

    try {
      switch (data.channel) {
        case ChannelType.IN_APP:
          return await this.processInApp(data, job.attemptsMade + 1);
        case ChannelType.WEB_PUSH:
          return await this.processWebPush(data, job.attemptsMade + 1);
        case ChannelType.EMAIL:
          return await this.processEmail(data, job.attemptsMade + 1);
      }
    } catch (error: unknown) {
      const message = errorMessage(error);
      await this.prisma.notification.update({
        where: { id: data.notificationId },
        data: { status: NotificationStatus.FAILED },
      });
      this.realtimeGateway.sendLogToProject(data.tenantId, data.projectId, {
        timestamp: new Date(),
        type: 'error',
        message: `Delivery failed: ${message}`,
        notificationId: data.notificationId,
        recipientId: data.externalUserId,
        channel: data.channel,
      });
      this.logger.error(
        `Notification ${data.notificationId} failed: ${message}`,
      );
      throw error;
    }
  }

  private async processInApp(data: NotificationJobData, attemptCount: number) {
    const previous = await this.findCompletedDelivery(data.notificationId);
    if (previous) {
      await this.resumeCompletedDelivery(data, NotificationStatus.SENT);
      return {
        success: previous.status === DeliveryStatus.SUCCESS,
        status: NotificationStatus.SENT,
      };
    }

    const delivery = await this.createDelivery(
      data.notificationId,
      'socket.io',
      attemptCount,
    );

    const connectedClients = await this.realtimeGateway.sendNotificationToRoom(
      data.tenantId,
      data.projectId,
      data.externalUserId,
      {
        id: data.notificationId,
        title: data.title,
        body: data.body,
        channel: data.channel,
        createdAt: new Date(),
      },
    );

    const skipped = connectedClients === 0;
    // Record the delivery before anything else can fail, so a retry sees it.
    await this.prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: skipped ? DeliveryStatus.SKIPPED : DeliveryStatus.SUCCESS,
        errorMessage: skipped
          ? 'No recipient was connected; notification remains available in history.'
          : null,
        sentAt: new Date(),
      },
    });
    await this.prisma.notification.update({
      where: { id: data.notificationId },
      data: { status: NotificationStatus.SENT },
    });

    this.realtimeGateway.sendLogToProject(data.tenantId, data.projectId, {
      timestamp: new Date(),
      type: skipped ? 'warning' : 'success',
      message: skipped
        ? `In-app notification stored; ${data.externalUserId} is offline`
        : `In-app notification emitted to ${connectedClients} connected client(s)`,
      notificationId: data.notificationId,
      recipientId: data.externalUserId,
      channel: data.channel,
    });

    return { success: !skipped, status: NotificationStatus.SENT };
  }

  private async processWebPush(
    data: NotificationJobData,
    attemptCount: number,
  ) {
    const tokens = await this.prisma.deviceToken.findMany({
      where: {
        tenantId: data.tenantId,
        projectId: data.projectId,
        recipientUserId: data.recipientDbId,
        platform: 'WEB',
      },
    });

    const deliveredProviders = new Set(
      (
        await this.prisma.notificationDelivery.findMany({
          where: {
            notificationId: data.notificationId,
            provider: { startsWith: 'web-push:' },
            status: DeliveryStatus.SUCCESS,
          },
          select: { provider: true },
        })
      ).map((delivery) => delivery.provider),
    );

    if (tokens.length === 0 && deliveredProviders.size === 0) {
      await Promise.all([
        this.prisma.notification.update({
          where: { id: data.notificationId },
          data: { status: NotificationStatus.FAILED },
        }),
        this.prisma.notificationDelivery.create({
          data: {
            notificationId: data.notificationId,
            provider: 'web-push',
            status: DeliveryStatus.SKIPPED,
            attemptCount,
            errorMessage: 'No Web Push subscription is registered.',
            sentAt: new Date(),
          },
        }),
      ]);
      this.realtimeGateway.sendLogToProject(data.tenantId, data.projectId, {
        timestamp: new Date(),
        type: 'warning',
        message: `Web Push failed: no subscription for ${data.externalUserId}`,
        notificationId: data.notificationId,
        recipientId: data.externalUserId,
        channel: data.channel,
      });
      return { success: false, status: NotificationStatus.FAILED };
    }

    // Devices that already received this notification on an earlier attempt
    // are not pushed again.
    const pendingTokens = tokens.filter(
      (token) => !deliveredProviders.has(`web-push:${token.id}`),
    );

    const outcomes = await Promise.all(
      pendingTokens.map(async (token) => {
        const delivery = await this.createDelivery(
          data.notificationId,
          `web-push:${token.id}`,
          attemptCount,
        );

        try {
          await this.pushService.sendPushNotification(token.token, {
            title: data.title,
            body: data.body,
            notificationId: data.notificationId,
          });
        } catch (error: unknown) {
          const failure = pushError(error);
          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
              status: DeliveryStatus.FAILED,
              errorMessage: failure.message,
              sentAt: new Date(),
            },
          });

          if (failure.statusCode === 404 || failure.statusCode === 410) {
            await this.prisma.deviceToken
              .delete({ where: { id: token.id } })
              .catch(() => undefined);
          }
          return false;
        }

        // Outside the try: a failed bookkeeping write must not relabel a push
        // the device already received as a failed send.
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: DeliveryStatus.SUCCESS,
            sentAt: new Date(),
          },
        });
        return true;
      }),
    );

    const newlySucceeded = outcomes.filter(Boolean).length;
    const succeeded = deliveredProviders.size + newlySucceeded;
    const failed = outcomes.length - newlySucceeded;
    if (succeeded === 0) {
      throw new Error('Web Push delivery failed on every registered device.');
    }

    await this.prisma.notification.update({
      where: { id: data.notificationId },
      data: { status: NotificationStatus.DELIVERED },
    });
    this.realtimeGateway.sendLogToProject(data.tenantId, data.projectId, {
      timestamp: new Date(),
      type: failed > 0 ? 'warning' : 'success',
      message:
        failed > 0
          ? `Web Push delivered to ${succeeded} device(s); ${failed} failed`
          : `Web Push delivered to ${succeeded} device(s)`,
      notificationId: data.notificationId,
      recipientId: data.externalUserId,
      channel: data.channel,
    });

    return { success: true, status: NotificationStatus.DELIVERED };
  }

  private async processEmail(data: NotificationJobData, attemptCount: number) {
    const previous = await this.findCompletedDelivery(data.notificationId);
    if (previous) {
      const status =
        previous.status === DeliveryStatus.SIMULATED
          ? NotificationStatus.SENT
          : NotificationStatus.DELIVERED;
      await this.resumeCompletedDelivery(data, status);
      return { success: true, status };
    }

    const recipient = await this.prisma.recipientUser.findFirst({
      where: {
        id: data.recipientDbId,
        tenantId: data.tenantId,
        projectId: data.projectId,
      },
    });
    const delivery = await this.createDelivery(
      data.notificationId,
      'email',
      attemptCount,
    );

    if (!recipient?.email) {
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: DeliveryStatus.FAILED,
          errorMessage: 'Recipient has no email address configured.',
          sentAt: new Date(),
        },
      });
      throw new Error('Recipient has no email address configured.');
    }

    let result: EmailDeliveryResult;
    try {
      result = await this.emailService.sendEmail(
        recipient.email,
        data.title,
        data.body,
      );
    } catch (error: unknown) {
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: DeliveryStatus.FAILED,
          errorMessage: errorMessage(error),
          sentAt: new Date(),
        },
      });
      throw error;
    }

    const notificationStatus = result.simulated
      ? NotificationStatus.SENT
      : NotificationStatus.DELIVERED;

    // Record the delivery before anything else can fail, so a retry sees it.
    // Outside the try above: a failed bookkeeping write must not relabel an
    // email that was already sent as a failed send.
    await this.prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        provider: result.provider,
        status: result.simulated
          ? DeliveryStatus.SIMULATED
          : DeliveryStatus.SUCCESS,
        sentAt: new Date(),
      },
    });
    await this.prisma.notification.update({
      where: { id: data.notificationId },
      data: { status: notificationStatus },
    });

    this.realtimeGateway.sendLogToProject(data.tenantId, data.projectId, {
      timestamp: new Date(),
      type: result.simulated ? 'warning' : 'success',
      message: result.simulated
        ? `Email simulated in console for ${recipient.email}`
        : `Email delivered via ${result.provider} to ${recipient.email}`,
      notificationId: data.notificationId,
      recipientId: data.externalUserId,
      channel: data.channel,
    });

    return { success: true, status: notificationStatus };
  }

  private findCompletedDelivery(notificationId: string) {
    return this.prisma.notificationDelivery.findFirst({
      where: {
        notificationId,
        status: { in: COMPLETED_DELIVERY_STATUSES },
      },
      select: { status: true },
    });
  }

  /**
   * An earlier attempt already handed the message to the provider but did not
   * finish its bookkeeping (a database error, or the worker died). Finish it
   * without sending a duplicate.
   */
  private async resumeCompletedDelivery(
    data: NotificationJobData,
    status: NotificationStatus,
  ) {
    await this.prisma.notification.update({
      where: { id: data.notificationId },
      data: { status },
    });
    this.realtimeGateway.sendLogToProject(data.tenantId, data.projectId, {
      timestamp: new Date(),
      type: 'info',
      message: `Notification ${data.notificationId.slice(0, 8)} was already delivered on an earlier attempt; skipped duplicate send`,
      notificationId: data.notificationId,
      recipientId: data.externalUserId,
      channel: data.channel,
    });
  }

  private createDelivery(
    notificationId: string,
    provider: string,
    attemptCount: number,
  ) {
    return this.prisma.notificationDelivery.create({
      data: {
        notificationId,
        provider,
        status: DeliveryStatus.PENDING,
        attemptCount,
      },
    });
  }
}
