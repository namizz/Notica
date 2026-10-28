import {
  AdapterCapableServer,
  RedisAdapterClient,
  RedisIoAdapter,
} from './redis-io.adapter';

interface FakeClient extends RedisAdapterClient {
  readonly isDuplicate: boolean;
  readonly quitCalls: number;
  readonly handlers: Map<string, (error: Error) => void>;
}

function fakeClient(isDuplicate = false): FakeClient {
  const handlers = new Map<string, (error: Error) => void>();
  const client = {
    isDuplicate,
    quitCalls: 0,
    handlers,
    duplicate: () => fakeClient(true),
    quit: () => {
      client.quitCalls += 1;
      return Promise.resolve('OK');
    },
    on: (event: string, listener: (error: Error) => void) => {
      handlers.set(event, listener);
      return client;
    },
  };

  return client;
}

function fakeServer() {
  const applied: unknown[] = [];
  const server: AdapterCapableServer & { applied: unknown[] } = {
    applied,
    adapter: (adapterConstructor: unknown) => {
      applied.push(adapterConstructor);
      return server;
    },
  };

  return server;
}

describe('RedisIoAdapter', () => {
  const app = {} as never;
  const env = { REDIS_URL: 'redis://redis.internal:6379' };

  function build() {
    const created: RedisAdapterClient[] = [];
    const adapterConstructor = Symbol('adapter-constructor');
    const buildAdapter = jest.fn(() => adapterConstructor);
    const adapter = new RedisIoAdapter(
      app,
      () => {
        const client = fakeClient();
        created.push(client);
        return client;
      },
      buildAdapter,
    );

    return { adapter, created, adapterConstructor, buildAdapter };
  }

  it('builds the adapter from a publisher and its duplicated subscriber', () => {
    const { adapter, created, buildAdapter } = build();

    adapter.connect(env);

    // One client is constructed; the subscriber must be a duplicate of it,
    // because a subscribed connection cannot also issue publish commands.
    expect(created).toHaveLength(1);
    expect(buildAdapter).toHaveBeenCalledTimes(1);

    const [pubClient, subClient] = buildAdapter.mock.calls[0] as [
      FakeClient,
      FakeClient,
    ];
    expect(pubClient.isDuplicate).toBe(false);
    expect(subClient.isDuplicate).toBe(true);
    expect(pubClient).not.toBe(subClient);
  });

  it('registers an error listener on both clients', () => {
    const { adapter, buildAdapter } = build();

    adapter.connect(env);

    const [pubClient, subClient] = buildAdapter.mock.calls[0] as [
      FakeClient,
      FakeClient,
    ];
    expect(pubClient.handlers.has('error')).toBe(true);
    expect(subClient.handlers.has('error')).toBe(true);
  });

  it('applies the Redis adapter to the Socket.IO server once connected', () => {
    const { adapter, adapterConstructor } = build();
    const server = fakeServer();

    adapter.connect(env);

    expect(adapter.applyAdapter(server)).toBe(true);
    expect(server.applied).toEqual([adapterConstructor]);
  });

  it('leaves the server untouched when it was never connected', () => {
    const { adapter } = build();
    const server = fakeServer();

    // Without this guard a Redis outage at boot would silently fall back to
    // process-local rooms, which is the bug this adapter exists to prevent.
    expect(adapter.applyAdapter(server)).toBe(false);
    expect(server.applied).toEqual([]);
  });

  it('quits both clients on disconnect', async () => {
    const { adapter, buildAdapter } = build();

    adapter.connect(env);
    const [pubClient, subClient] = buildAdapter.mock.calls[0] as [
      FakeClient,
      FakeClient,
    ];

    await adapter.disconnect();

    expect(pubClient.quitCalls).toBe(1);
    expect(subClient.quitCalls).toBe(1);
  });

  it('is idempotent and stops applying the adapter after disconnect', async () => {
    const { adapter, buildAdapter } = build();
    const server = fakeServer();

    adapter.connect(env);
    const [pubClient] = buildAdapter.mock.calls[0] as [FakeClient];

    await adapter.disconnect();
    await adapter.disconnect();

    expect(pubClient.quitCalls).toBe(1);
    expect(adapter.applyAdapter(server)).toBe(false);
  });

  it('survives a client that fails to close', async () => {
    const failing = fakeClient();
    failing.quit = () => Promise.reject(new Error('connection already gone'));
    const adapter = new RedisIoAdapter(
      app,
      () => failing,
      () => Symbol('adapter-constructor'),
    );

    adapter.connect(env);

    // Shutdown must not be blocked by a Redis client that is already dead.
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });

  it('fails fast when the Redis connection settings are invalid', () => {
    const { adapter } = build();

    expect(() =>
      adapter.connect({ REDIS_URL: 'http://redis.internal' }),
    ).toThrow('REDIS_URL must use redis:// or rediss://');
  });
});
