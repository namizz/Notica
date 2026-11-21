import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { WebhookDeliveryStatus } from '@prisma/client';
import { Job, UnrecoverableError } from 'bullmq';
import { computeSignature } from '../common/hmac.util';
import { isProductionEnv } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { assertSafeWebhookUrl } from './url-guard';
import { WEBHOOK_DELIVERY_QUEUE, WebhookJobData } from './webhook-events';
import { WebhooksService } from './webhooks.service';

const TIMEOUT_MS = 10_000;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sends one signed webhook. Headers:
 *   Notica-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "t.body")>
 *   Notica-Event-Id, Notica-Event-Type
 * A 2xx response is success; anything else is retried with backoff. A 410
 * response disables the endpoint.
 */
@Processor(WEBHOOK_DELIVERY_QUEUE)
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<{ status: number }> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: job.data.deliveryId },
      include: { endpoint: true },
    });
    if (!delivery || delivery.status === WebhookDeliveryStatus.SUCCESS) {
      return { status: 0 };
    }
    if (!delivery.endpoint.enabled) {
      await this.finish(delivery.id, WebhookDeliveryStatus.FAILED, {
        lastError: 'Endpoint is disabled',
      });
      return { status: 0 };
    }

    const attempts = job.attemptsMade + 1;
    const isLastAttempt = attempts >= (job.opts.attempts ?? 1);
    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = computeSignature(
      this.webhooks.secretFor(delivery.endpointId),
      timestamp,
      body,
    );

    let status = 0;
    try {
      await assertSafeWebhookUrl(delivery.endpoint.url, {
        production: isProductionEnv(),
      });
      const response = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Notica-Webhooks/1.0',
          'Notica-Event-Id': delivery.eventId,
          'Notica-Event-Type': delivery.eventType,
          'Notica-Signature': `t=${timestamp},v1=${signature}`,
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
      await response.body?.cancel().catch(() => undefined);
    } catch (error: unknown) {
      await this.finish(
        delivery.id,
        isLastAttempt ? WebhookDeliveryStatus.FAILED : WebhookDeliveryStatus.PENDING,
        { attempts, lastError: errorMessage(error) },
      );
      throw error;
    }

    if (status >= 200 && status < 300) {
      await this.finish(delivery.id, WebhookDeliveryStatus.SUCCESS, {
        attempts,
        lastStatusCode: status,
        lastError: null,
        deliveredAt: new Date(),
      });
      return { status };
    }

    if (status === 410) {
      await this.prisma.webhookEndpoint.update({
        where: { id: delivery.endpointId },
        data: { enabled: false },
      });
      await this.finish(delivery.id, WebhookDeliveryStatus.FAILED, {
        attempts,
        lastStatusCode: status,
        lastError: 'Endpoint answered 410 Gone; it has been disabled',
      });
      this.logger.warn(`Webhook endpoint ${delivery.endpointId} disabled after 410`);
      throw new UnrecoverableError('Webhook endpoint is gone');
    }

    await this.finish(
      delivery.id,
      isLastAttempt ? WebhookDeliveryStatus.FAILED : WebhookDeliveryStatus.PENDING,
      { attempts, lastStatusCode: status, lastError: `HTTP ${status}` },
    );
    throw new Error(`Webhook endpoint answered HTTP ${status}`);
  }

  private finish(
    id: string,
    status: WebhookDeliveryStatus,
    data: {
      attempts?: number;
      lastStatusCode?: number;
      lastError?: string | null;
      deliveredAt?: Date;
    },
  ) {
    return this.prisma.webhookDelivery.update({
      where: { id },
      data: { status, ...data },
    });
  }
}
