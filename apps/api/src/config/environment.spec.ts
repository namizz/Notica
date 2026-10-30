import {
  appRole,
  redisConnectionOptions,
  runsDeliveryWorker,
  validateProductionEnvironment,
} from './environment';

function productionEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://notica:secret@db.internal:5432/notica',
    REDIS_URL: 'redis://redis.internal:6379',
    FRONTEND_URL: 'https://notica.example.com',
    JWT_SECRET: 'jwt-secret-that-is-longer-than-thirty-two-characters',
    JWT_REFRESH_SECRET:
      'refresh-secret-that-is-longer-than-thirty-two-characters',
    CLIENT_TOKEN_SECRET:
      'client-secret-that-is-longer-than-thirty-two-characters',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_CALLBACK_URL: 'https://api.notica.example.com/auth/google/callback',
    GITHUB_CLIENT_ID: 'github-client-id',
    GITHUB_CLIENT_SECRET: 'github-client-secret',
    GITHUB_CALLBACK_URL: 'https://api.notica.example.com/auth/github/callback',
    VAPID_PUBLIC_KEY: 'public-vapid-key',
    VAPID_PRIVATE_KEY: 'private-vapid-key',
    VAPID_SUBJECT: 'mailto:ops@notica.example.com',
  };
}

describe('production environment validation', () => {
  it('accepts a complete production environment', () => {
    expect(() =>
      validateProductionEnvironment(productionEnvironment()),
    ).not.toThrow();
  });

  it('rejects missing production variables', () => {
    const env = productionEnvironment();
    delete env.DATABASE_URL;

    expect(() => validateProductionEnvironment(env)).toThrow(
      'Missing required production environment variable: DATABASE_URL',
    );
  });

  it('rejects weak or reused signing secrets', () => {
    const weak = productionEnvironment();
    weak.JWT_SECRET = 'super-secret-dev';
    expect(() => validateProductionEnvironment(weak)).toThrow(
      'JWT_SECRET must be a unique production secret',
    );

    const reused = productionEnvironment();
    reused.JWT_REFRESH_SECRET = reused.JWT_SECRET;
    expect(() => validateProductionEnvironment(reused)).toThrow(
      'must be different',
    );
  });

  it('rejects frontend URLs that include a path', () => {
    const env = productionEnvironment();
    env.FRONTEND_URL = 'https://notica.example.com/auth/callback';

    expect(() => validateProductionEnvironment(env)).toThrow(
      'FRONTEND_URL must be an HTTPS origin',
    );
  });

  it('rejects incomplete SMTP configuration', () => {
    const env = productionEnvironment();
    env.SMTP_HOST = 'smtp.example.com';

    expect(() => validateProductionEnvironment(env)).toThrow(
      'SMTP configuration is incomplete',
    );
  });

  it('accepts each supported deployment role', () => {
    for (const role of ['all', 'api', 'worker']) {
      const env = productionEnvironment();
      env.APP_ROLE = role;

      expect(() => validateProductionEnvironment(env)).not.toThrow();
    }
  });

  it('rejects a mistyped deployment role before boot', () => {
    const env = productionEnvironment();
    env.APP_ROLE = 'api-server';

    expect(() => validateProductionEnvironment(env)).toThrow(
      'APP_ROLE must be one of all, api, worker',
    );
  });
});

describe('deployment role', () => {
  it('defaults to the combined role when unset', () => {
    expect(appRole({})).toBe('all');
    expect(appRole({ APP_ROLE: '' })).toBe('all');
    expect(appRole({ APP_ROLE: '   ' })).toBe('all');
  });

  it('normalises case and surrounding whitespace', () => {
    expect(appRole({ APP_ROLE: ' Worker ' })).toBe('worker');
    expect(appRole({ APP_ROLE: 'API' })).toBe('api');
  });

  it('rejects an unknown role', () => {
    expect(() => appRole({ APP_ROLE: 'both' })).toThrow(
      'APP_ROLE must be one of all, api, worker; received "both"',
    );
  });

  it('runs the delivery worker in every role except api', () => {
    expect(runsDeliveryWorker({})).toBe(true);
    expect(runsDeliveryWorker({ APP_ROLE: 'all' })).toBe(true);
    expect(runsDeliveryWorker({ APP_ROLE: 'worker' })).toBe(true);
    expect(runsDeliveryWorker({ APP_ROLE: 'api' })).toBe(false);
  });
});

describe('Redis connection options', () => {
  it('parses authenticated TLS Redis URLs', () => {
    expect(
      redisConnectionOptions({
        REDIS_URL: 'rediss://default:p%40ss@redis.example.com:6380',
      }),
    ).toEqual({
      host: 'redis.example.com',
      port: 6380,
      username: 'default',
      password: 'p@ss',
      tls: {},
      maxRetriesPerRequest: null,
    });
  });

  it('supports separate host and port values', () => {
    expect(
      redisConnectionOptions({
        REDIS_HOST: 'redis.internal',
        REDIS_PORT: '6379',
      }),
    ).toEqual({
      host: 'redis.internal',
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });

  it('splits a REDIS_HOST that already carries the port', () => {
    // Render exposes Key Value as "red-xxxx:6379"; left joined, DNS is asked
    // to resolve a hostname containing the port and fails with ENOTFOUND.
    expect(
      redisConnectionOptions({ REDIS_HOST: 'red-dbi3v8c9v7es738kmkv0:6379' }),
    ).toEqual({
      host: 'red-dbi3v8c9v7es738kmkv0',
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });

  it('lets an explicit REDIS_PORT win over an embedded one', () => {
    expect(
      redisConnectionOptions({
        REDIS_HOST: 'redis.internal:6379',
        REDIS_PORT: '6380',
      }),
    ).toEqual({
      host: 'redis.internal',
      port: 6380,
      maxRetriesPerRequest: null,
    });
  });

  it('leaves an IPv6 literal host untouched', () => {
    expect(redisConnectionOptions({ REDIS_HOST: '::1' })).toEqual({
      host: '::1',
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });
});
