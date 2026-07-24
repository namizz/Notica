import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ChannelType,
  DeliveryStatus,
  NotificationStatus,
} from '@prisma/client';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
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
    await Promise.all([
      this.prisma.notification.update({
        where: { id: data.notificationId },
        data: { status: NotificationStatus.SENT },
      }),
      this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: skipped ? DeliveryStatus.SKIPPED : DeliveryStatus.SUCCESS,
          errorMessage: skipped
            ? 'No recipient was connected; notification remains available in history.'
            : null,
          sentAt: new Date(),
        },
      }),
    ]);

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

    if (tokens.length === 0) {
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

    const outcomes = await Promise.all(
      tokens.map(async (token) => {
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
          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
              status: DeliveryStatus.SUCCESS,
              sentAt: new Date(),
            },
          });
          return true;
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
      }),
    );

    const succeeded = outcomes.filter(Boolean).length;
    const failed = outcomes.length - succeeded;
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

    try {
      const result = await this.emailService.sendEmail(
        recipient.email,
        data.title,
        data.body,
      );
      const notificationStatus = result.simulated
        ? NotificationStatus.SENT
        : NotificationStatus.DELIVERED;

      await Promise.all([
        this.prisma.notification.update({
          where: { id: data.notificationId },
          data: { status: notificationStatus },
        }),
        this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            provider: result.provider,
            status: result.simulated
              ? DeliveryStatus.SIMULATED
              : DeliveryStatus.SUCCESS,
            sentAt: new Date(),
          },
        }),
      ]);

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
