import { Injectable, Logger } from '@nestjs/common';
import { EmailProvider, EmailSendError, EmailSendParams, EmailSendResult } from './email-provider.interface';

@Injectable()
export class ResendProvider implements EmailProvider {
  private readonly logger = new Logger(ResendProvider.name);

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (params.idempotencyKey) headers['Idempotency-Key'] = params.idempotencyKey;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
      const msg = `Resend API error ${response.status}: ${body.slice(0, 200)}`;
      this.logger.error(msg);
      throw new EmailSendError(msg, permanent);
    }

    const data = (await response.json()) as { id: string };
    this.logger.log(`Email sent via Resend: ${data.id}`);
    return { messageId: data.id, provider: 'resend', simulated: false };
  }
}
