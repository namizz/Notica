import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { ChannelRequestError } from './channel-errors';
import type { ChannelHandler } from './channel-handler.interface';

/** Delivered by the notifications core itself; always available. */
export const BUILT_IN_CHANNELS: ChannelType[] = [
  ChannelType.IN_APP,
  ChannelType.WEB_PUSH,
];

@Injectable()
export class ChannelRegistry {
  private readonly logger = new Logger(ChannelRegistry.name);
  private readonly handlers = new Map<ChannelType, ChannelHandler>();

  register(handler: ChannelHandler) {
    if (this.handlers.has(handler.channel)) {
      throw new Error(`Channel ${handler.channel} is registered twice`);
    }
    this.handlers.set(handler.channel, handler);
    this.logger.log(
      handler.isEnabled()
        ? `Channel ${handler.channel} enabled (provider: ${handler.providerName()})`
        : `Channel ${handler.channel} available but not configured`,
    );
  }

  get(channel: ChannelType): ChannelHandler | undefined {
    return this.handlers.get(channel);
  }

  list(): ChannelHandler[] {
    return [...this.handlers.values()];
  }

  isBuiltIn(channel: ChannelType): boolean {
    return BUILT_IN_CHANNELS.includes(channel);
  }

  /** The handler for a pluggable channel, or a 400 when it is not set up. */
  requireEnabled(channel: ChannelType): ChannelHandler {
    const handler = this.handlers.get(channel);
    if (!handler || !handler.isEnabled()) {
      throw new ChannelRequestError(
        HttpStatus.BAD_REQUEST,
        'CHANNEL_NOT_ENABLED',
        `The ${channel} channel is not enabled on this server`,
      );
    }
    return handler;
  }
}
