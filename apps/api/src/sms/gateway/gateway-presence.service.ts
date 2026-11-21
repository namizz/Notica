import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { redisConnectionOptions } from '../../config/environment';

/** A phone counts as online for this long after its last heartbeat. */
export const PRESENCE_TTL_SECONDS = 90;

const key = (deviceId: string) => `notica:gw:online:${deviceId}`;

/**
 * Which gateway phones are connected, shared across API instances through
 * Redis so any instance (or the worker) can tell whether a push will land.
 */
@Injectable()
export class GatewayPresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(GatewayPresenceService.name);
  private client: Redis | null = null;
  private warned = false;

  private redis(): Redis {
    if (!this.client) {
      this.client = new Redis({
        ...redisConnectionOptions(),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      this.client.on('error', (error: Error) => {
        if (!this.warned) {
          this.warned = true;
          this.logger.warn(`Gateway presence Redis error: ${error.message}`);
        }
      });
    }
    return this.client;
  }

  async markOnline(deviceId: string) {
    try {
      await this.redis().set(key(deviceId), '1', 'EX', PRESENCE_TTL_SECONDS);
    } catch (error: unknown) {
      this.logger.warn(`Could not mark ${deviceId} online: ${String(error)}`);
    }
  }

  async markOffline(deviceId: string) {
    try {
      await this.redis().del(key(deviceId));
    } catch (error: unknown) {
      this.logger.warn(`Could not mark ${deviceId} offline: ${String(error)}`);
    }
  }

  async isOnline(deviceId: string): Promise<boolean> {
    return (await this.onlineIds([deviceId])).has(deviceId);
  }

  async onlineIds(deviceIds: string[]): Promise<Set<string>> {
    if (deviceIds.length === 0) {
      return new Set();
    }
    try {
      const values = await this.redis().mget(deviceIds.map(key));
      return new Set(deviceIds.filter((_, index) => values[index] !== null));
    } catch (error: unknown) {
      this.logger.warn(`Could not read gateway presence: ${String(error)}`);
      return new Set();
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }
}
