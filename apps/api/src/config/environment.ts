import type { RedisOptions } from 'bullmq';

const MIN_SECRET_LENGTH = 32;

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required production environment variable: ${key}`);
  }
  return value;
}

function validateUrl(
  env: NodeJS.ProcessEnv,
  key: string,
  protocols: string[],
): URL {
  const value = required(env, key);
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }

  if (!protocols.includes(url.protocol)) {
    throw new Error(`${key} must use ${protocols.join(' or ')}`);
  }
  return url;
}

function validateSecret(env: NodeJS.ProcessEnv, key: string): string {
  const value = required(env, key);
  const knownDevelopmentValues = [
    'super-secret-dev',
    'super-secret-dev-refresh',
    'your-super-secret',
    'disabled',
    'placeholder',
  ];

  if (
    value.length < MIN_SECRET_LENGTH ||
    knownDevelopmentValues.some((candidate) => value.includes(candidate))
  ) {
    throw new Error(
      `${key} must be a unique production secret of at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return value;
}

function validateOptionalGroup(
  env: NodeJS.ProcessEnv,
  keys: string[],
  label: string,
) {
  const configured = keys.filter((key) => env[key]?.trim());
  if (configured.length > 0 && configured.length !== keys.length) {
    const missing = keys.filter((key) => !env[key]?.trim());
    throw new Error(
      `${label} configuration is incomplete; missing: ${missing.join(', ')}`,
    );
  }
}

export function validateProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
) {
  const isProduction = env.NODE_ENV === 'production' || env.RENDER === 'true';
  if (!isProduction) {
    return;
  }

  validateUrl(env, 'DATABASE_URL', ['postgresql:', 'postgres:']);
  const frontendUrl = validateUrl(env, 'FRONTEND_URL', ['https:']);
  if (frontendUrl.pathname !== '/' || frontendUrl.search || frontendUrl.hash) {
    throw new Error(
      'FRONTEND_URL must be an HTTPS origin without a path, query, or fragment',
    );
  }

  if (!env.REDIS_URL?.trim() && !env.REDIS_HOST?.trim()) {
    throw new Error(
      'Production requires REDIS_URL or the REDIS_HOST/REDIS_PORT pair',
    );
  }
  if (env.REDIS_URL?.trim()) {
    validateUrl(env, 'REDIS_URL', ['redis:', 'rediss:']);
  }

  const secrets = [
    validateSecret(env, 'JWT_SECRET'),
    validateSecret(env, 'JWT_REFRESH_SECRET'),
    validateSecret(env, 'CLIENT_TOKEN_SECRET'),
  ];
  if (new Set(secrets).size !== secrets.length) {
    throw new Error(
      'JWT_SECRET, JWT_REFRESH_SECRET, and CLIENT_TOKEN_SECRET must be different',
    );
  }

  const googleKeys = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CALLBACK_URL',
  ];
  const githubKeys = [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'GITHUB_CALLBACK_URL',
  ];
  const vapidKeys = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
  const smtpKeys = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
  ];

  googleKeys.forEach((key) => required(env, key));
  githubKeys.forEach((key) => required(env, key));
  vapidKeys.forEach((key) => required(env, key));
  validateOptionalGroup(env, smtpKeys, 'SMTP');

  validateUrl(env, 'GOOGLE_CALLBACK_URL', ['https:']);
  validateUrl(env, 'GITHUB_CALLBACK_URL', ['https:']);
  validateUrl(env, 'VAPID_SUBJECT', ['mailto:', 'https:']);

  if (env.SMTP_PORT) {
    const smtpPort = Number(env.SMTP_PORT);
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      throw new Error('SMTP_PORT must be a valid TCP port');
    }
  }
}

export function redisConnectionOptions(
  env: NodeJS.ProcessEnv = process.env,
): RedisOptions {
  const redisUrl = env.REDIS_URL?.trim();
  if (redisUrl) {
    const url = new URL(redisUrl);
    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
      throw new Error('REDIS_URL must use redis:// or rediss://');
    }

    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      username: url.username
        ? decodeURIComponent(url.username)
        : undefined,
      password: url.password
        ? decodeURIComponent(url.password)
        : undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }

  const port = Number(env.REDIS_PORT || 6379);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('REDIS_PORT must be a valid TCP port');
  }

  return {
    host: env.REDIS_HOST || 'localhost',
    port,
    maxRetriesPerRequest: null,
  };
}
