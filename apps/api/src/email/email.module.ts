import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ConsoleProvider } from './console.provider';
import { EmailChannelHandler } from './email-channel.handler';
import { EmailService } from './email.service';
import { EmailWebhooksController } from './email-webhooks.controller';
import { ResendProvider } from './resend.provider';
import { SmtpProvider } from './smtp.provider';

@Module({
  imports: [PrismaModule, RealtimeModule, WebhooksModule],
  controllers: [EmailWebhooksController],
  providers: [SmtpProvider, ConsoleProvider, ResendProvider, EmailService, EmailChannelHandler],
  exports: [EmailService],
})
export class EmailModule {}
