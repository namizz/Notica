import { Injectable, Logger } from '@nestjs/common';
import { SmtpProvider } from './smtp.provider';
import { ConsoleProvider } from './console.provider';
import { EmailProvider } from './email-provider.interface';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private activeProvider: EmailProvider;

  constructor(
    private readonly smtpProvider: SmtpProvider,
    private readonly consoleProvider: ConsoleProvider,
  ) {
    const host = process.env.SMTP_HOST;
    if (host) {
      this.activeProvider = this.smtpProvider;
      this.logger.log('Active email provider: SMTP');
    } else {
      this.activeProvider = this.consoleProvider;
      this.logger.log('Active email provider: CONSOLE (fallback)');
    }
  }

  async sendEmail(to: string, subject: string, htmlContent: string): Promise<any> {
    return this.activeProvider.send(to, subject, htmlContent);
  }
}
