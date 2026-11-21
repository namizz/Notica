import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { emailProviderName } from '../config/environment';
import { ConsoleProvider } from './console.provider';
import { ResendProvider } from './resend.provider';
import { SmtpProvider } from './smtp.provider';
import { EmailProvider, EmailSendParams, EmailSendResult } from './email-provider.interface';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private activeProvider: EmailProvider | null = null;

  constructor(
    private readonly smtpProvider: SmtpProvider,
    private readonly consoleProvider: ConsoleProvider,
    private readonly resendProvider: ResendProvider,
  ) {}

  onModuleInit() {
    const name = emailProviderName();
    switch (name) {
      case 'smtp': this.activeProvider = this.smtpProvider; break;
      case 'resend': this.activeProvider = this.resendProvider; break;
      case 'console': this.activeProvider = this.consoleProvider; break;
      default: this.activeProvider = null;
    }
    this.logger.log(name ? `Active email provider: ${name.toUpperCase()}` : 'Email channel disabled');
  }

  isEnabled(): boolean { return this.activeProvider !== null; }

  providerName(): string | null { return emailProviderName(); }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    if (!this.activeProvider) throw new Error('Email channel is disabled on this server.');
    return this.activeProvider.send(params);
  }
}
