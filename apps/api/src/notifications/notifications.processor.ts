import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationStatus, DeliveryStatus } from '@prisma/client';
import { Logger } from '@nestjs/common';

@Processor('notification-delivery')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private prisma: PrismaService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { notificationId, channel, title, body, externalUserId } = job.data;
    this.logger.log(`Processing notification job ${job.id} for notification ${notificationId} (${channel})`);

    // 1. Update status to PROCESSING
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.PROCESSING },
    });

    // 2. Create notification delivery attempt log
    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        notificationId,
        provider: channel === 'IN_APP' ? 'local-in-app' : 'local-web-push',
        status: DeliveryStatus.PENDING,
        attemptCount: job.attemptsMade + 1,
      },
    });

    try {
      // 3. Process delivery based on channel type
      if (channel === 'IN_APP') {
        // In-app notifications are directly stored in DB, so delivery is instant
        this.logger.log(`In-app notification delivered locally to DB for user: ${externalUserId}`);
      } else if (channel === 'WEB_PUSH') {
        // Simulating external Web Push dispatching mechanism
        this.logger.log(`Simulating Web Push delivery dispatch to user: ${externalUserId} (Title: ${title})`);
        
        // Simulating latency
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // 4. Mark notification as DELIVERED
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: NotificationStatus.DELIVERED },
      });

      // 5. Update delivery record to SUCCESS
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: DeliveryStatus.SUCCESS,
          sentAt: new Date(),
        },
      });

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to deliver notification ${notificationId}: ${error.message}`);

      // 6. Mark notification as FAILED
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: NotificationStatus.FAILED },
      });

      // 7. Update delivery record to FAILED
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: DeliveryStatus.FAILED,
          errorMessage: error.message || 'Unknown delivery failure',
        },
      });

      throw error; // Rethrow to let BullMQ handle retries
    }
  }
}
