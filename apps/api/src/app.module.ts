import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { QueueModule } from './queue/queue.module';
import { RecipientsModule } from './recipients/recipients.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PushModule } from './push/push.module';
import { DeviceTokensModule } from './device-tokens/device-tokens.module';
import { AuthTestController } from './auth-test.controller';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ProjectsModule,
    QueueModule,
    RecipientsModule,
    NotificationsModule,
    RealtimeModule,
    PushModule,
    DeviceTokensModule,
    EmailModule,
    HealthModule,
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute
      limit: 10,  // max 10 requests per minute
    }]),
  ],
  controllers: [AuthTestController],
  providers: [],
})
export class AppModule {}
