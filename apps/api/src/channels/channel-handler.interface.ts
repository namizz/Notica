import type {
  ChannelType,
  NotificationStatus,
  RecipientUser,
} from '@prisma/client';

/** The BullMQ payload for one notification delivery. */
export interface NotificationJobData {
  notificationId: string;
  tenantId: string;
  projectId: string;
  recipientDbId: string;
  externalUserId: string;
  title: string;
  body: string;
  channel: ChannelType;
}

export interface DeliveryOutcome {
  success: boolean;
  status: NotificationStatus;
}

/** What a channel needs to decide, at request time, whether it can send. */
export interface ChannelPrepareContext {
  tenantId: string;
  projectId: string;
  recipient: Pick<
    RecipientUser,
    'id' | 'externalUserId' | 'email' | 'phone' | 'emailSuppressedAt'
  >;
  title: string;
  body: string;
}

export interface ChannelReadiness {
  /** The channel can send for this project right now. */
  ready: boolean;
  /** Why it is not ready, or a short note such as the active provider. */
  detail?: string;
}

/**
 * A pluggable delivery channel (email, SMS, ...). Each channel lives in its
 * own module and registers itself with the ChannelRegistry. The
 * notifications core only talks to this interface, so a channel can be
 * removed or left unconfigured without affecting any other channel.
 */
export interface ChannelHandler {
  readonly channel: ChannelType;

  /** Configured on this server (its provider is set). */
  isEnabled(): boolean;

  /** Name of the active provider, e.g. "resend", "smtp", "gateway". */
  providerName(): string | null;

  /**
   * Request-time checks, run before the notification is stored. Throw a
   * ChannelRequestError to reject the request with a clear 4xx.
   */
  prepare?(context: ChannelPrepareContext): Promise<void>;

  /** Delivers one notification from the queue worker. */
  deliver(job: NotificationJobData, attempt: number): Promise<DeliveryOutcome>;

  /** Whether this project can use the channel now (e.g. a phone is paired). */
  readiness?(tenantId: string, projectId: string): Promise<ChannelReadiness>;
}
