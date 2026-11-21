import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { emailProviderName, isProductionEnv } from '../config/environment';
import { EmailProvider, EmailSendError, EmailSendParams, EmailSendResult } from './email-provider.interface';

function classifySmtpError(error: unknown): 'transient' | 'permanent' {
  if (!(error instanceof Error)) return 'transient';
  const code = (error as NodeJS.ErrnoException).code;
  const responseCode = (error as { responseCode?: number }).responseCode;
  if (code === 'EAUTH') return 'permanent';
  if (responseCode !== undefined) {
    if (responseCode >= 500) return 'permanent';
    if (responseCode >= 400) return 'transient';
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET') return 'transient';
  return 'transient';
}

@Injectable()
export class SmtpProvider implements EmailProvider, OnModuleInit {
  private readonly logger = new Logger(SmtpProvider.name);
  private transporter: nodemailer.Transporter | null = null;

  async onModuleInit() {
    if (emailProviderName() !== 'smtp') return;
    const host = process.env.SMTP_HOST;
    if (!host) return;

    const port = Number(process.env.SMTP_PORT ?? 587);
    const smtpSecureEnv = process.env.SMTP_SECURE;
    const secure = smtpSecureEnv !== undefined
      ? smtpSecureEnv === 'true' || smtpSecureEnv === '1'
      : port === 465;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure,
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      auth: process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    if (isProductionEnv()) {
      await this.transporter.verify();
      this.logger.log(`SMTP verified: ${host}:${port}`);
    } else {
      this.logger.log(`SMTP provider initialized: ${host}:${port}`);
    }
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    if (!this.transporter) throw new Error('SMTP transporter is not initialized.');
    try {
      const info = await this.transporter.sendMail({
        from: params.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      this.logger.log(`Email sent via SMTP: ${info.messageId}`);
      return { messageId: info.messageId as string, provider: 'smtp', simulated: false };
    } catch (error: unknown) {
      const kind = classifySmtpError(error);
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`SMTP error (${kind}): ${msg}`);
      throw new EmailSendError(msg, kind === 'permanent');
    }
  }
}
