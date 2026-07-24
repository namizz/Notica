export interface EmailDeliveryResult {
  messageId: string;
  provider: 'smtp' | 'console';
  delivered: boolean;
  simulated: boolean;
}

export interface EmailProvider {
  send(
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<EmailDeliveryResult>;
}
