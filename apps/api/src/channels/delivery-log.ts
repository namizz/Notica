import { DeliveryStatus, NotificationStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  ActivityLogPayload,
  RealtimeGateway,
} from '../realtime/realtime.gateway';
import type { NotificationJobData } from './channel-handler.interface';

/**
 * Delivery outcomes that mean the provider was already handed the message.
 * A retried or stalled job that finds one of these must not send again.
 */
export const COMPLETED_DELIVERY_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.SUCCESS,
  DeliveryStatus.SIMULATED,
  DeliveryStatus.SKIPPED,
];

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown delivery failure';
}

/** Small helpers every channel uses to record and report a delivery. */
export class DeliveryLog {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  createDelivery(notificationId: string, provider: string, attempt: number) {
    return this.prisma.notificationDelivery.create({
      data: {
        notificationId,
        provider,
        status: DeliveryStatus.PENDING,
        attemptCount: attempt,
      },
    });
  }

  findCompletedDelivery(notificationId: string) {
    return this.prisma.notificationDelivery.findFirst({
      where: {
        notificationId,
        status: { in: COMPLETED_DELIVERY_STATUSES },
      },
      select: { id: true, status: true },
    });
  }

  setNotificationStatus(notificationId: string, status: NotificationStatus) {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { status },
    });
  }

  log(
    data: Pick<
      NotificationJobData,
      'tenantId' | 'projectId' | 'notificationId' | 'externalUserId' | 'channel'
    >,
    type: ActivityLogPayload['type'],
    message: string,
  ) {
    this.realtime.sendLogToProject(data.tenantId, data.projectId, {
      timestamp: new Date(),
      type,
      message,
      notificationId: data.notificationId,
      recipientId: data.externalUserId,
      channel: data.channel,
    });
  }

  /**
   * An earlier attempt already handed the message to the provider but did not
   * finish its bookkeeping. Finish it without sending a duplicate.
   */
  async resumeCompleted(data: NotificationJobData, status: NotificationStatus) {
    await this.setNotificationStatus(data.notificationId, status);
    this.log(
      data,
      'info',
      `Notification ${data.notificationId.slice(0, 8)} was already delivered on an earlier attempt; skipped duplicate send`,
    );
  }
}
