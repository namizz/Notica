import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChannelRegistry } from './channel-registry';
import { ChannelsController } from './channels.controller';

/**
 * Shared, channel-agnostic plumbing. Channel modules (email, SMS) import
 * nothing from each other; each registers its handler here.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ChannelsController],
  providers: [ChannelRegistry],
  exports: [ChannelRegistry],
})
export class ChannelsModule {}
