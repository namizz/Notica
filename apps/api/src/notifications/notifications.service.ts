import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { Notification, NotificationStatus, Prisma } from '@prisma/client';
import { sanitizeText } from './utils/sanitize.util';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import type { NotificationJobData } from './notifications.processor';

/** The fields a replayed request must repeat exactly to reuse its key. */
type ReplayableRequest = Pick<
  SendNotificationDto,
  'recipientId' | 'title' | 'body' | 'channel'
>;

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
    idempotencyKey?: string,
  ): Promise<{ notification: Notification; replayed: boolean }> {
    const { recipientId, title, body, channel } = dto;
    const sanitizedTitle = sanitizeText(title);
    const sanitizedBody = sanitizeText(body);
    await this.assertProjectAccess(tenantId, projectId);

    const request: ReplayableRequest = {
      recipientId,
      title: sanitizedTitle,
      body: sanitizedBody,
      channel,
    };

    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(
        projectId,
        idempotencyKey,
      );
      if (existing) {
        return this.replay(existing, request);
      }
    }

    // 1. Resolve or auto-create the recipient user. Upsert keeps two
    // concurrent first sends to the same recipient from colliding.
    const recipient = await this.prisma.recipientUser.upsert({
      where: {
        projectId_externalUserId: {
          projectId,
          externalUserId: recipientId,
        },
      },
      update: {},
      create: {
        tenantId,
        projectId,
        externalUserId: recipientId,
      },
    });

    // 2. Create the notification record in DB (PENDING status)
    let notification: Notification;
    try {
      notification = await this.prisma.notification.create({
        data: {
          tenantId,
          projectId,
          recipientUserId: recipient.id,
          title: sanitizedTitle,
          body: sanitizedBody,
          channel,
          status: NotificationStatus.PENDING,
          idempotencyKey,
        },
      });
    } catch (error: unknown) {
      // A concurrent request with the same key won the insert; answer with
      // its notification rather than failing or sending a second one.
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findByIdempotencyKey(
          projectId,
          idempotencyKey,
        );
        if (existing) {
          return this.replay(existing, request);
        }
      }
      throw error;
    }

    // 3. Enqueue the asynchronous delivery job into BullMQ
    await this.enqueueDelivery(notification, recipient.externalUserId);

    return { notification, replayed: false };
  }

  private findByIdempotencyKey(projectId: string, idempotencyKey: string) {
    return this.prisma.notification.findUnique({
      where: { projectId_idempotencyKey: { projectId, idempotencyKey } },
      include: { recipientUser: { select: { externalUserId: true } } },
    });
  }

  private async replay(
    existing: Notification & { recipientUser: { externalUserId: string } },
    request: ReplayableRequest,
  ) {
    const { recipientUser, ...notification } = existing;

    if (
      recipientUser.externalUserId !== request.recipientId ||
      notification.title !== request.title ||
      notification.body !== request.body ||
      notification.channel !== request.channel
    ) {
      throw new UnprocessableEntityException(
        'Idempotency-Key was already used for a different notification',
      );
    }

    // The original request may have stored the row and then failed to reach
    // Redis. Enqueueing again is safe: the fixed job id makes BullMQ ignore it
    // while the original job still exists.
    if (notification.status === NotificationStatus.PENDING) {
      await this.enqueueDelivery(notification, recipientUser.externalUserId);
    }

    return { notification, replayed: true };
  }

  private async enqueueDelivery(
    notification: Notification,
    externalUserId: string,
  ) {
    const job: NotificationJobData = {
      notificationId: notification.id,
      tenantId: notification.tenantId,
      projectId: notification.projectId,
      recipientDbId: notification.recipientUserId,
      externalUserId,
      title: notification.title,
      body: notification.body,
      channel: notification.channel,
    };

    await this.deliveryQueue.add('send-notification', job, {
      // One job per notification, so the same notification is never queued twice.
      jobId: notification.id,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s...
      },
    });
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
