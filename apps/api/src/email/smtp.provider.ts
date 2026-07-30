import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailDeliveryResult, EmailProvider } from './email-provider.interface';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown SMTP error';
}

@Injectable()
export class SmtpProvider implements EmailProvider, OnModuleInit {
  private readonly logger = new Logger(SmtpProvider.name);
  private transporter: nodemailer.Transporter | null = null;

  onModuleInit() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host) {
      this.logger.warn(
        'SMTP_HOST is not configured. SMTP provider will be unavailable.',
      );
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: host,
        port: port ? parseInt(port, 10) : 587,
        secure: port === '465',
        auth: user && pass ? { user, pass } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
      this.logger.log(`SMTP provider initialized for host: ${host}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to initialize SMTP transporter: ${errorMessage(error)}`,
      );
    }
  }

  async send(
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<EmailDeliveryResult> {
    if (!this.transporter) {
      throw new Error('SMTP transporter is not initialized.');
    }

    const from = process.env.SMTP_FROM || 'noreply@notica.com';
    const mailOptions = {
      from,
      to,
      subject,
      html: htmlContent,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully via SMTP: ${info.messageId}`);
      return {
        messageId: info.messageId,
        provider: 'smtp',
        delivered: true,
        simulated: false,
      };
    } catch (error: unknown) {
      this.logger.error(`Error sending email via SMTP: ${errorMessage(error)}`);
      throw error;
    }
  }
}
