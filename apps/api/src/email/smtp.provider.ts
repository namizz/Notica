import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailProvider } from './email-provider.interface';

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
      this.logger.warn('SMTP_HOST is not configured. SMTP provider will be unavailable.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: host,
        port: port ? parseInt(port, 10) : 587,
        secure: port === '465',
        auth: user && pass ? { user, pass } : undefined,
      });
      this.logger.log(`SMTP provider initialized for host: ${host}`);
    } catch (e: any) {
      this.logger.error(`Failed to initialize SMTP transporter: ${e.message}`);
    }
  }

  async send(to: string, subject: string, htmlContent: string): Promise<any> {
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
      return info;
    } catch (e: any) {
      this.logger.error(`Error sending email via SMTP: ${e.message}`);
      throw e;
    }
  }
}
