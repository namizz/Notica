import { Module } from '@nestjs/common';
import { PushService } from './push.service';
import { WebPushProvider } from './web-push.provider';

@Module({
  providers: [PushService, WebPushProvider],
  exports: [PushService],
})
export class PushModule {}
