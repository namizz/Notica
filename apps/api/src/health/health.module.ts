import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'notification-delivery',
    }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
