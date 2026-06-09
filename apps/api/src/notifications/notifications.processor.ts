import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationStatus, DeliveryStatus } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PushService } from '../push/push.service';

@Processor('notification-delivery')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private prisma: PrismaService,
    private realtimeGateway: RealtimeGateway,
    private pushService: PushService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { notificationId, tenantId, recipientDbId, channel, title, body, externalUserId } = job.data;
    this.logger.log(`Processing notification job ${job.id} for notification ${notificationId} (${channel})`);

    // Emit start log
    this.realtimeGateway.sendLogToProject(tenantId, {
      timestamp: new Date(),
      type: 'info',
      message: `Processing notification ${notificationId.substring(0, 8)}... (${channel})`,
      notificationId,
      recipientId: externalUserId,
      channel,
    });

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
        // Emit WebSocket message to the recipient's room
        this.realtimeGateway.sendNotificationToRoom(tenantId, externalUserId, {
          id: notificationId,
          title,
          body,
          channel,
          createdAt: new Date(),
        });
        this.logger.log(`In-app notification broadcasted via WebSocket to user: ${externalUserId}`);
      } else if (channel === 'WEB_PUSH') {
        // Fetch all active Web Push device tokens for this recipient
        const tokens = await this.prisma.deviceToken.findMany({
          where: {
            tenantId,
            recipientUserId: recipientDbId,
            platform: 'WEB',
          },
        });

        if (tokens.length === 0) {
          this.logger.warn(`No registered Web Push device tokens found for user: ${externalUserId}`);
          this.realtimeGateway.sendLogToProject(tenantId, {
            timestamp: new Date(),
            type: 'warning',
            message: `Web Push dispatch skipped: no registered tokens for user ${externalUserId}`,
            notificationId,
            recipientId: externalUserId,
            channel,
          });
        } else {
          this.logger.log(`Sending Web Push to ${tokens.length} registered device(s) for user: ${externalUserId}`);
          
          const pushPromises = tokens.map(async (token) => {
            try {
              await this.pushService.sendPushNotification(token.token, {
                title,
                body,
                notificationId,
              });
            } catch (err: any) {
              this.logger.error(`Failed to deliver Web Push for token ID ${token.id}: ${err.message}`);
              
              // If subscription is expired or invalid (410 Gone / 404 Not Found), delete the token record
              if (err.statusCode === 410 || err.statusCode === 404) {
                this.logger.warn(`Web Push endpoint expired. Deleting token ID: ${token.id}`);
                await this.prisma.deviceToken.delete({
                  where: { id: token.id },
                }).catch(() => {});
              }
              throw err;
            }
          });

          // Wait for all push deliveries to complete. 
          // We settle them so that a single bad token doesn't crash the entire job if others succeed.
          const results = await Promise.allSettled(pushPromises);
          const succeeded = results.filter(r => r.status === 'fulfilled').length;
          
          if (succeeded === 0 && tokens.length > 0) {
            throw new Error('Web Push delivery failed on all registered devices.');
          }
        }
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

      // Emit success log
      this.realtimeGateway.sendLogToProject(tenantId, {
        timestamp: new Date(),
        type: 'success',
        message: `Notification delivered successfully to ${externalUserId}`,
        notificationId,
        recipientId: externalUserId,
        channel,
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

      // Emit failure log
      this.realtimeGateway.sendLogToProject(tenantId, {
        timestamp: new Date(),
        type: 'error',
        message: `Delivery failed: ${error.message}`,
        notificationId,
        recipientId: externalUserId,
        channel,
      });

      throw error; // Rethrow to let BullMQ handle retries
    }
  }
}
