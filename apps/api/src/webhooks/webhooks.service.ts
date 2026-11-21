import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, WebhookEndpoint } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { deriveSecret } from '../common/hmac.util';
import { isProductionEnv, webhookSigningKey } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';
import { assertSafeWebhookUrl } from './url-guard';
import {
  ALL_EVENTS,
  WEBHOOK_DELIVERY_QUEUE,
  WebhookEventPayload,
  WebhookEventType,
  WebhookJobData,
} from './webhook-events';

const SECRET_PREFIX = 'whsec_';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE) private readonly queue: Queue,
  ) {}

  /** Customer webhooks need a signing key; without one they stay off. */
  isEnabled(): boolean {
    return webhookSigningKey() !== null;
  }

  private signingKey(): string {
    const key = webhookSigningKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'Webhooks are not configured on this server (WEBHOOK_SIGNING_KEY)',
      );
    }
    return key;
  }

  secretFor(endpointId: string): string {
    return deriveSecret(this.signingKey(), SECRET_PREFIX, endpointId);
  }

  private async assertProject(tenantId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  private async checkUrl(url: string) {
    try {
      await assertSafeWebhookUrl(url, { production: isProductionEnv() });
    } catch (error: unknown) {
      throw new BadRequestException(errorMessage(error));
    }
  }

  private async findEndpoint(tenantId: string, projectId: string, id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id, tenantId, projectId },
    });
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    return endpoint;
  }

  async create(tenantId: string, projectId: string, dto: CreateWebhookDto) {
    await this.assertProject(tenantId, projectId);
    this.signingKey();
    await this.checkUrl(dto.url);

    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        tenantId,
        projectId,
        url: dto.url,
        description: dto.description,
        events: dto.events,
      },
    });
    // The secret is derived, so it can be shown again; the dashboard still
    // treats it as sensitive and only reveals it on request.
    return { ...endpoint, secret: this.secretFor(endpoint.id) };
  }

  async list(tenantId: string, projectId: string) {
    await this.assertProject(tenantId, projectId);
    return this.prisma.webhookEndpoint.findMany({
      where: { tenantId, projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revealSecret(tenantId: string, projectId: string, id: string) {
    const endpoint = await this.findEndpoint(tenantId, projectId, id);
    return { id: endpoint.id, secret: this.secretFor(endpoint.id) };
  }

  async update(
    tenantId: string,
    projectId: string,
    id: string,
    dto: UpdateWebhookDto,
  ) {
    await this.findEndpoint(tenantId, projectId, id);
    if (dto.url) {
      await this.checkUrl(dto.url);
    }
    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, projectId: string, id: string) {
    await this.findEndpoint(tenantId, projectId, id);
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    return { deleted: true };
  }

  async deliveries(tenantId: string, projectId: string, id: string) {
    await this.findEndpoint(tenantId, projectId, id);
    return this.prisma.webhookDelivery.findMany({
      where: { endpointId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async sendTest(tenantId: string, projectId: string, id: string) {
    const endpoint = await this.findEndpoint(tenantId, projectId, id);
    const event: WebhookEventPayload = {
      id: `evt_${randomUUID()}`,
      type: 'webhook.test',
      createdAt: new Date().toISOString(),
      projectId,
      data: { message: 'Test event from Notica' },
    };
    const [delivery] = await this.enqueue([endpoint], event);
    return delivery;
  }

  /**
   * Fans an event out to every enabled endpoint of the project subscribed to
   * it. Never throws: a webhook problem must not fail a notification.
   */
  async publish(
    tenantId: string,
    projectId: string,
    type: WebhookEventType,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    try {
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: {
          tenantId,
          projectId,
          enabled: true,
          events: { hasSome: [type, ALL_EVENTS] },
        },
      });
      if (endpoints.length === 0) {
        return;
      }
      await this.enqueue(endpoints, {
        id: `evt_${randomUUID()}`,
        type,
        createdAt: new Date().toISOString(),
        projectId,
        data,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Could not publish ${type} webhook for project ${projectId}: ${errorMessage(error)}`,
      );
    }
  }

  private async enqueue(
    endpoints: WebhookEndpoint[],
    event: WebhookEventPayload,
  ) {
    const deliveries = await Promise.all(
      endpoints.map((endpoint) =>
        this.prisma.webhookDelivery.create({
          data: {
            endpointId: endpoint.id,
            eventId: event.id,
            eventType: event.type,
            payload: event as unknown as Prisma.InputJsonValue,
          },
        }),
      ),
    );

    await Promise.all(
      deliveries.map((delivery) =>
        this.queue.add(
          'deliver-webhook',
          { deliveryId: delivery.id } satisfies WebhookJobData,
          {
            jobId: delivery.id,
            attempts: 8,
            // 10s, 20s, 40s ... about 21 minutes in total.
            backoff: { type: 'exponential', delay: 10_000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        ),
      ),
    );
    return deliveries;
  }
}
