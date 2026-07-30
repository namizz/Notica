import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { redisConnectionOptions } from '../config/environment';

@Module({
  imports: [
    BullModule.forRoot({
      connection: redisConnectionOptions(),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
