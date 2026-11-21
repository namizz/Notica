/** Thrown by a provider when the error is permanent (no retry). */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}

export interface EmailSendParams {
  to: string;
  subject: string;
  text: string;
  html: string;
  from: string;
  idempotencyKey?: string;
}

export interface EmailSendResult {
  messageId: string;
  provider: 'smtp' | 'resend' | 'console';
  simulated: boolean;
}

export interface EmailProvider {
  send(params: EmailSendParams): Promise<EmailSendResult>;
}

/** @deprecated Use EmailSendResult */
export type EmailDeliveryResult = EmailSendResult & { delivered: boolean };
