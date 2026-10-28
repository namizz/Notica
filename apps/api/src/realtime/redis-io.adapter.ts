import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import { redisConnectionOptions } from '../config/environment';

/**
 * The subset of a Redis client this adapter depends on. Declaring it locally
 * keeps the adapter unit-testable without a Redis server.
 */
export interface RedisAdapterClient {
  duplicate(): RedisAdapterClient;
  quit(): Promise<unknown>;
  on(event: string, listener: (error: Error) => void): unknown;
}

/** The slice of a Socket.IO server this adapter writes to. */
export interface AdapterCapableServer {
  adapter(adapterConstructor: unknown): unknown;
}

export type RedisClientFactory = (options: RedisOptions) => RedisAdapterClient;

export type AdapterFactory = (
  pubClient: RedisAdapterClient,
  subClient: RedisAdapterClient,
) => unknown;

function defaultClientFactory(options: RedisOptions): RedisAdapterClient {
  // BullMQ requires maxRetriesPerRequest: null, but the pub/sub clients should
  // surface connection failures instead of queueing commands indefinitely.
  const pubSubOptions: RedisOptions = { ...options };
  delete pubSubOptions.maxRetriesPerRequest;
  return new Redis(pubSubOptions);
}

const defaultAdapterFactory: AdapterFactory = (pubClient, subClient) =>
  createAdapter(pubClient, subClient);

/**
 * Socket.IO rooms are local to one Node process. Without a shared adapter,
 * an instance that processes a delivery job cannot emit to a recipient socket
 * held by a different instance: the emit is dropped and `fetchSockets()`
 * reports zero, so the attempt is recorded as SKIPPED even though the
 * recipient was connected.
 *
 * This adapter puts room membership and emits on Redis pub/sub, which makes
 * both `emit` and `fetchSockets()` cluster-wide. It reuses the connection
 * settings that already back BullMQ, so no extra infrastructure is required.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private pubClient?: RedisAdapterClient;
  private subClient?: RedisAdapterClient;
  private adapterConstructor?: unknown;

  constructor(
    app: INestApplicationContext,
    private readonly createClient: RedisClientFactory = defaultClientFactory,
    private readonly buildAdapter: AdapterFactory = defaultAdapterFactory,
  ) {
    super(app);
  }

  /** Opens the pub/sub pair. Call before `useWebSocketAdapter`. */
  connect(env: NodeJS.ProcessEnv = process.env): void {
    const pubClient = this.createClient(redisConnectionOptions(env));
    const subClient = pubClient.duplicate();

    pubClient.on('error', (error: Error) =>
      this.logger.error(`Realtime Redis publisher error: ${error.message}`),
    );
    subClient.on('error', (error: Error) =>
      this.logger.error(`Realtime Redis subscriber error: ${error.message}`),
    );

    this.pubClient = pubClient;
    this.subClient = subClient;
    this.adapterConstructor = this.buildAdapter(pubClient, subClient);

    this.logger.log(
      'Realtime gateway is using the Redis adapter; room events span every instance',
    );
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options) as AdapterCapableServer;
    this.applyAdapter(server);
    return server;
  }

  /**
   * Socket.IO re-initialises existing namespaces when the adapter is set, so
   * `/realtime` picks this up regardless of creation order.
   */
  applyAdapter(server: AdapterCapableServer): boolean {
    if (!this.adapterConstructor) {
      this.logger.warn(
        'Redis adapter is not connected; realtime events stay local to this instance',
      );
      return false;
    }

    server.adapter(this.adapterConstructor);
    return true;
  }

  /** Closes the pub/sub pair. Safe to call more than once. */
  async disconnect(): Promise<void> {
    const clients = [this.pubClient, this.subClient].filter(
      (client): client is RedisAdapterClient => Boolean(client),
    );

    this.pubClient = undefined;
    this.subClient = undefined;
    this.adapterConstructor = undefined;

    await Promise.all(
      clients.map((client) =>
        client.quit().catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'unknown error';
          this.logger.warn(`Realtime Redis client did not close: ${message}`);
        }),
      ),
    );
  }

  /** Invoked by Nest on shutdown once shutdown hooks are enabled. */
  async close(server: Server): Promise<void> {
    await super.close(server);
    await this.disconnect();
  }
}
