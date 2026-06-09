import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { SmtpProvider } from './smtp.provider';
import { ConsoleProvider } from './console.provider';

@Module({
  providers: [EmailService, SmtpProvider, ConsoleProvider],
  exports: [EmailService],
})
export class EmailModule {}
