import { Injectable, Logger } from '@nestjs/common';
import { EmailProvider } from './email-provider.interface';

@Injectable()
export class ConsoleProvider implements EmailProvider {
  private readonly logger = new Logger(ConsoleProvider.name);

  async send(to: string, subject: string, htmlContent: string): Promise<any> {
    this.logger.log(`[CONSOLE EMAIL DELIVERY] to: ${to} | subject: ${subject}`);
    this.logger.log(`[CONSOLE EMAIL BODY]\n${htmlContent}`);
    return {
      messageId: `console-${Date.now()}`,
      response: 'Email delivered to console logs.',
    };
  }
}
