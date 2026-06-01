import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NotificationStatus } from '@prisma/client';
import { sanitizeText } from './utils/sanitize.util';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('notification-delivery') private deliveryQueue: Queue,
  ) {}

  async sendNotification(tenantId: string, projectId: string, dto: SendNotificationDto) {
    const { recipientId, title, body, channel } = dto;
    const sanitizedTitle = sanitizeText(title);
    const sanitizedBody = sanitizeText(body);

    // 1. Resolve or auto-create the recipient user
    let recipient = await this.prisma.recipientUser.findUnique({
      where: {
        tenantId_externalUserId: {
          tenantId,
          externalUserId: recipientId,
        },
      },
    });

    if (!recipient) {
      recipient = await this.prisma.recipientUser.create({
        data: {
          tenantId,
          externalUserId: recipientId,
        },
      });
    }

    // 2. Create the notification record in DB (PENDING status)
    const notification = await this.prisma.notification.create({
      data: {
        tenantId,
        recipientUserId: recipient.id,
        title: sanitizedTitle,
        body: sanitizedBody,
        channel,
        status: NotificationStatus.PENDING,
      },
    });

    // 3. Enqueue the asynchronous delivery job into BullMQ
    await this.deliveryQueue.add('send-notification', {
      notificationId: notification.id,
      tenantId,
      recipientDbId: recipient.id,
      externalUserId: recipient.externalUserId,
      title: sanitizedTitle,
      body: sanitizedBody,
      channel,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s...
      },
    });

    return notification;
  }

  async getRecipientNotifications(tenantId: string, externalUserId: string) {
    const recipient = await this.prisma.recipientUser.findUnique({
      where: {
        tenantId_externalUserId: {
          tenantId,
          externalUserId,
        },
      },
    });

    if (!recipient) {
      return [];
    }

    return this.prisma.notification.findMany({
      where: {
        tenantId,
        recipientUserId: recipient.id,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(tenantId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        tenantId,
      },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${notificationId} not found`);
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }
}
