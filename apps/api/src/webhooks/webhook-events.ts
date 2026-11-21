/**
 * Events a project can subscribe to. Channels publish them; the webhooks
 * module knows nothing about any channel.
 */
export const WEBHOOK_EVENT_TYPES = [
  'notification.sent',
  'notification.delivered',
  'notification.failed',
  'email.bounced',
  'email.complained',
  'gateway.online',
  'gateway.offline',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Subscribes an endpoint to every event, including ones added later. */
export const ALL_EVENTS = '*';

export interface WebhookEventPayload {
  id: string;
  type: WebhookEventType | 'webhook.test';
  createdAt: string;
  projectId: string;
  data: Record<string, unknown>;
}

export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery';

export interface WebhookJobData {
  deliveryId: string;
}
