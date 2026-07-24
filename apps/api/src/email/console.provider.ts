import { Injectable, Logger } from '@nestjs/common';
import { EmailDeliveryResult, EmailProvider } from './email-provider.interface';

@Injectable()
export class ConsoleProvider implements EmailProvider {
  private readonly logger = new Logger(ConsoleProvider.name);

  send(
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<EmailDeliveryResult> {
    this.logger.log(`[CONSOLE EMAIL DELIVERY] to: ${to} | subject: ${subject}`);
    this.logger.log(`[CONSOLE EMAIL BODY]\n${htmlContent}`);
    return Promise.resolve({
      messageId: `console-${Date.now()}`,
      provider: 'console',
      delivered: false,
      simulated: true,
    });
  }
}
