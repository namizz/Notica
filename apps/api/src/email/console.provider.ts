import { Injectable, Logger } from '@nestjs/common';
import { EmailProvider, EmailSendParams, EmailSendResult } from './email-provider.interface';

@Injectable()
export class ConsoleProvider implements EmailProvider {
  private readonly logger = new Logger(ConsoleProvider.name);

  send(params: EmailSendParams): Promise<EmailSendResult> {
    this.logger.log(`[CONSOLE EMAIL] to: ${params.to} | subject: ${params.subject}`);
    this.logger.log(`[CONSOLE EMAIL BODY]\n${params.text}`);
    return Promise.resolve({
      messageId: `console-${Date.now()}`,
      provider: 'console',
      simulated: true,
    });
  }
}
