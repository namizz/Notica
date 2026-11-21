import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ChannelType, DeliveryStatus, NotificationStatus } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import {
  ChannelHandler,
  ChannelPrepareContext,
  ChannelReadiness,
  DeliveryOutcome,
  NotificationJobData,
} from '../channels/channel-handler.interface';
import { ChannelRegistry } from '../channels/channel-registry';
import { ChannelRequestError } from '../channels/channel-errors';
import { DeliveryLog } from '../channels/delivery-log';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EmailService } from './email.service';
import { renderBasicEmail } from './templates/basic-email';
import { EmailSendError } from './email-provider.interface';

@Injectable()
export class EmailChannelHandler implements ChannelHandler, OnModuleInit {
  readonly channel = ChannelType.EMAIL;
  private readonly logger = new Logger(EmailChannelHandler.name);
  private readonly log: DeliveryLog;

  constructor(
    private readonly registry: ChannelRegistry,
    private readonly prisma: PrismaService,
    realtime: RealtimeGateway,
    private readonly emailService: EmailService,
    private readonly webhooks: WebhooksService,
  ) {
    this.log = new DeliveryLog(prisma, realtime);
  }

  onModuleInit() {
    this.registry.register(this);
  }

  isEnabled(): boolean {
    return this.emailService.isEnabled();
  }

  providerName(): string | null {
    return this.emailService.providerName();
  }

  async prepare(context: ChannelPrepareContext): Promise<void> {
    if (!context.recipient.email) {
      throw new ChannelRequestError(
        HttpStatus.BAD_REQUEST,
        'RECIPIENT_HAS_NO_EMAIL',
        'The recipient has no email address. Pass "email" or identify the recipient with one.',
      );
    }
    if (context.recipient.emailSuppressedAt) {
      throw new ChannelRequestError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'RECIPIENT_EMAIL_SUPPRESSED',
        "This recipient's email address has been suppressed (bounce or complaint).",
      );
    }
  }

  async readiness(): Promise<ChannelReadiness> {
    return {
      ready: this.emailService.isEnabled(),
      detail: this.emailService.providerName() ?? 'disabled',
    };
  }

  async deliver(job: NotificationJobData, attempt: number): Promise<DeliveryOutcome> {
    const previous = await this.log.findCompletedDelivery(job.notificationId);
    if (previous) {
      const status =
        previous.status === DeliveryStatus.SIMULATED
          ? NotificationStatus.SENT
          : NotificationStatus.DELIVERED;
      await this.log.resumeCompleted(job, status);
      return { success: true, status };
    }

    const recipient = await this.prisma.recipientUser.findFirst({
      where: { id: job.recipientDbId, tenantId: job.tenantId, projectId: job.projectId },
    });

    if (!recipient?.email) {
      const delivery = await this.log.createDelivery(job.notificationId, 'email', attempt);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: DeliveryStatus.FAILED, errorMessage: 'Recipient has no email address.', sentAt: new Date() },
      });
      await this.log.setNotificationStatus(job.notificationId, NotificationStatus.FAILED);
      this.log.log(job, 'error', `Email failed: recipient has no email`);
      throw new UnrecoverableError('Recipient has no email address.');
    }

    if (recipient.emailSuppressedAt) {
      const delivery = await this.log.createDelivery(job.notificationId, 'email', attempt);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: DeliveryStatus.SKIPPED, errorMessage: 'Recipient email suppressed.', sentAt: new Date() },
      });
      await this.log.setNotificationStatus(job.notificationId, NotificationStatus.FAILED);
      this.log.log(job, 'warning', `Email skipped: recipient ${recipient.email} is suppressed`);
      return { success: false, status: NotificationStatus.FAILED };
    }

    const delivery = await this.log.createDelivery(job.notificationId, 'email', attempt);
    const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || 'noreply@notica.app';
    const { html, text } = renderBasicEmail({ title: job.title, body: job.body });

    try {
      const result = await this.emailService.send({
        to: recipient.email,
        from,
        subject: job.title,
        html,
        text,
        idempotencyKey: job.notificationId,
      });

      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          provider: result.provider,
          providerMessageId: result.messageId,
          status: result.simulated ? DeliveryStatus.SIMULATED : DeliveryStatus.SUCCESS,
          sentAt: new Date(),
        },
      });
      await this.log.setNotificationStatus(job.notificationId, NotificationStatus.SENT);
      this.log.log(
        job,
        result.simulated ? 'warning' : 'success',
        result.simulated
          ? `Email simulated in console for ${recipient.email}`
          : `Email sent via ${result.provider} to ${recipient.email}`,
      );
      if (!result.simulated) {
        await this.webhooks.publish(job.tenantId, job.projectId, 'notification.sent', {
          notificationId: job.notificationId,
          channel: ChannelType.EMAIL,
          recipientId: job.externalUserId,
          to: recipient.email,
          provider: result.provider,
        });
      }
      return { success: true, status: NotificationStatus.SENT };
    } catch (error: unknown) {
      const isPermanent = error instanceof EmailSendError && error.permanent;
      const msg = error instanceof Error ? error.message : String(error);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: DeliveryStatus.FAILED, errorMessage: msg, sentAt: new Date() },
      });
      this.log.log(job, 'error', `Email to ${recipient.email} failed: ${msg}`);
      if (isPermanent) {
        await this.log.setNotificationStatus(job.notificationId, NotificationStatus.FAILED);
        await this.webhooks.publish(job.tenantId, job.projectId, 'notification.failed', {
          notificationId: job.notificationId,
          channel: ChannelType.EMAIL,
          recipientId: job.externalUserId,
          errorMessage: msg,
        });
        throw new UnrecoverableError(msg);
      }
      throw error;
    }
  }
}
