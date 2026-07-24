import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NotificationStatus, Prisma } from '@prisma/client';
import { sanitizeText } from './utils/sanitize.util';
import { ListNotificationsDto } from './dto/list-notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('notification-delivery') private deliveryQueue: Queue,
  ) {}

  private async assertProjectAccess(tenantId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true },
    });

    if (!project) {
      throw new UnauthorizedException('Project access is invalid');
    }
  }

  async sendNotification(
    tenantId: string,
    projectId: string,
    dto: SendNotificationDto,
  ) {
    const { recipientId, title, body, channel } = dto;
    const sanitizedTitle = sanitizeText(title);
    const sanitizedBody = sanitizeText(body);
    await this.assertProjectAccess(tenantId, projectId);

    // 1. Resolve or auto-create the recipient user
    let recipient = await this.prisma.recipientUser.findUnique({
      where: {
        projectId_externalUserId: {
          projectId,
          externalUserId: recipientId,
        },
      },
    });

    if (!recipient) {
      recipient = await this.prisma.recipientUser.create({
        data: {
          tenantId,
          projectId,
          externalUserId: recipientId,
        },
      });
    }

    // 2. Create the notification record in DB (PENDING status)
    const notification = await this.prisma.notification.create({
      data: {
        tenantId,
        projectId,
        recipientUserId: recipient.id,
        title: sanitizedTitle,
        body: sanitizedBody,
        channel,
        status: NotificationStatus.PENDING,
      },
    });

    // 3. Enqueue the asynchronous delivery job into BullMQ
    await this.deliveryQueue.add(
      'send-notification',
      {
        notificationId: notification.id,
        tenantId,
        projectId,
        recipientDbId: recipient.id,
        externalUserId: recipient.externalUserId,
        title: sanitizedTitle,
        body: sanitizedBody,
        channel,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5s, 10s, 20s...
        },
      },
    );

    return notification;
  }

  async getRecipientNotifications(
    tenantId: string,
    projectId: string,
    externalUserId: string,
  ) {
    await this.assertProjectAccess(tenantId, projectId);
    const recipient = await this.prisma.recipientUser.findUnique({
      where: {
        projectId_externalUserId: {
          projectId,
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
        projectId,
        recipientUserId: recipient.id,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTenantNotifications(
    tenantId: string,
    projectId: string,
    query: ListNotificationsDto,
  ) {
    await this.assertProjectAccess(tenantId, projectId);
    const { page, limit, channel, status, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      tenantId,
      projectId,
    };

    if (channel) {
      where.channel = channel;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
        {
          recipientUser: {
            externalUserId: { contains: search, mode: 'insensitive' },
          },
        },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        include: {
          recipientUser: {
            select: {
              externalUserId: true,
              name: true,
              email: true,
            },
          },
          deliveries: {
            orderBy: {
              sentAt: 'desc',
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data,
    };
  }

  async markAsRead(
    tenantId: string,
    projectId: string,
    notificationId: string,
  ) {
    await this.assertProjectAccess(tenantId, projectId);
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        tenantId,
        projectId,
      },
    });

    if (!notification) {
      throw new NotFoundException(
        `Notification with ID ${notificationId} not found`,
      );
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
