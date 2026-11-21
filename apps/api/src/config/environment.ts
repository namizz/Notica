import type { RedisOptions } from 'bullmq';

const MIN_SECRET_LENGTH = 32;

/**
 * Deployment roles for a single build artifact.
 *
 * - `all`    serves HTTP and consumes the delivery queue (default; single-service deployments)
 * - `api`    serves HTTP only, so request load never competes with delivery work
 * - `worker` serves HTTP for health checks only and consumes the delivery queue
 */
export const APP_ROLES = ['all', 'api', 'worker'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function appRole(env: NodeJS.ProcessEnv = process.env): AppRole {
  const value = env.APP_ROLE?.trim().toLowerCase();
  if (!value) {
    return 'all';
  }

  if (!APP_ROLES.includes(value as AppRole)) {
    throw new Error(
      `APP_ROLE must be one of ${APP_ROLES.join(', ')}; received "${value}"`,
    );
  }

  return value as AppRole;
}

/** Only roles that own delivery register the BullMQ processor. */
export function runsDeliveryWorker(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return appRole(env) !== 'api';
}

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

  // Fail fast on a mistyped role rather than silently deploying the wrong one.
  appRole(env);

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

  // Each channel is optional and validated on its own: an email-only
  // deployment needs no SMS settings and an SMS-only one no email settings.
  validateEmailChannel(env);
  validateSmsChannel(env);

  if (env.WEBHOOK_SIGNING_KEY?.trim()) {
    validateSecret(env, 'WEBHOOK_SIGNING_KEY');
  }
}

function validateEmailChannel(env: NodeJS.ProcessEnv) {
  const provider = emailProviderName(env);
  if (provider === 'console') {
    throw new Error(
      'EMAIL_PROVIDER=console only logs emails and is not allowed in production',
    );
  }
  if (provider === 'smtp') {
    required(env, 'SMTP_HOST');
    if (!env.EMAIL_FROM?.trim() && !env.SMTP_FROM?.trim()) {
      throw new Error('EMAIL_PROVIDER=smtp requires EMAIL_FROM (or SMTP_FROM)');
    }
  }
  if (provider === 'resend') {
    required(env, 'RESEND_API_KEY');
    required(env, 'EMAIL_FROM');
  }
}

function validateSmsChannel(env: NodeJS.ProcessEnv) {
  const provider = smsProviderName(env);
  if (provider === 'console') {
    throw new Error(
      'SMS_PROVIDER=console only logs messages and is not allowed in production',
    );
  }
  if (provider === 'gateway') {
    validateSecret(env, 'GATEWAY_SIGNING_KEY');
    validateUrl(env, 'PUBLIC_API_URL', ['https:']);
  }
  smsSettings(env);
}

export function isProductionEnv(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === 'production' || env.RENDER === 'true';
}

// Development-only fallbacks so webhooks and gateways work without setup.
// Production never uses them (the keys are required there).
const DEV_WEBHOOK_SIGNING_KEY = 'notica-dev-webhook-signing-key-not-for-production';
const DEV_GATEWAY_SIGNING_KEY = 'notica-dev-gateway-signing-key-not-for-production';

/** Signs customer webhooks. Null (webhooks off) in production when unset. */
export function webhookSigningKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.WEBHOOK_SIGNING_KEY?.trim();
  if (value) {
    return value;
  }
  return isProductionEnv(env) ? null : DEV_WEBHOOK_SIGNING_KEY;
}

/** Derives each gateway phone's request-signing secret. */
export function gatewaySigningKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.GATEWAY_SIGNING_KEY?.trim();
  if (value) {
    return value;
  }
  return isProductionEnv(env) ? null : DEV_GATEWAY_SIGNING_KEY;
}

export const EMAIL_PROVIDERS = ['resend', 'smtp', 'console'] as const;
export type EmailProviderName = (typeof EMAIL_PROVIDERS)[number];

/**
 * The active email provider, or null when email is off.
 *
 * EMAIL_PROVIDER wins when set (`off` disables email). When unset, an
 * existing SMTP_HOST keeps selecting SMTP, and development falls back to
 * logging emails to the console. Production without either has email off.
 */
export function emailProviderName(
  env: NodeJS.ProcessEnv = process.env,
): EmailProviderName | null {
  const value = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (value) {
    if (value === 'off' || value === 'none') {
      return null;
    }
    if (!EMAIL_PROVIDERS.includes(value as EmailProviderName)) {
      throw new Error(
        `EMAIL_PROVIDER must be one of ${EMAIL_PROVIDERS.join(', ')}, off; received "${value}"`,
      );
    }
    return value as EmailProviderName;
  }
  if (env.SMTP_HOST?.trim()) {
    return 'smtp';
  }
  return isProductionEnv(env) ? null : 'console';
}

export const SMS_PROVIDERS = ['gateway', 'console'] as const;
export type SmsProviderName = (typeof SMS_PROVIDERS)[number];

/** The active SMS provider, or null when SMS is off (the default). */
export function smsProviderName(
  env: NodeJS.ProcessEnv = process.env,
): SmsProviderName | null {
  const value = env.SMS_PROVIDER?.trim().toLowerCase();
  if (!value || value === 'off' || value === 'none') {
    return null;
  }
  if (!SMS_PROVIDERS.includes(value as SmsProviderName)) {
    throw new Error(
      `SMS_PROVIDER must be one of ${SMS_PROVIDERS.join(', ')}, off; received "${value}"`,
    );
  }
  return value as SmsProviderName;
}

function integerFromEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[key]?.trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export interface SmsSettings {
  messageTtlMinutes: number;
  maxParts: number;
  dailyLimitPerProject: number;
  leaseSeconds: number;
  maxDispatchAttempts: number;
  reassignAfterSeconds: number;
  textRetentionDays: number;
}

export function smsSettings(env: NodeJS.ProcessEnv = process.env): SmsSettings {
  return {
    messageTtlMinutes: integerFromEnv(env, 'SMS_MESSAGE_TTL_MINUTES', 60, 1, 10_080),
    maxParts: integerFromEnv(env, 'SMS_MAX_PARTS', 10, 1, 30),
    dailyLimitPerProject: integerFromEnv(env, 'SMS_DAILY_LIMIT_PER_PROJECT', 500, 1, 1_000_000),
    leaseSeconds: integerFromEnv(env, 'SMS_LEASE_SECONDS', 120, 10, 3600),
    maxDispatchAttempts: integerFromEnv(env, 'SMS_MAX_DISPATCH_ATTEMPTS', 5, 1, 100),
    reassignAfterSeconds: integerFromEnv(env, 'SMS_REASSIGN_AFTER_SECONDS', 300, 30, 86_400),
    textRetentionDays: integerFromEnv(env, 'SMS_TEXT_RETENTION_DAYS', 30, 1, 3650),
  };
}

/** Public base URL of this API, embedded in gateway pairing QR codes. */
export function publicApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.PUBLIC_API_URL?.trim();
  const url = value || `http://localhost:${env.PORT ?? 8000}`;
  return url.replace(/\/+$/, '');
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
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }

  // Render and several managed providers expose the instance as a single
  // "host:port" string. Passed through verbatim, ioredis asks DNS to resolve a
  // name containing the port, which always fails with ENOTFOUND. Split it here
  // so the common copy-paste mistake is not a boot failure. Only an unambiguous
  // single-colon form is split, so IPv6 literals are left alone.
  const rawHost = env.REDIS_HOST?.trim() || 'localhost';
  const segments = rawHost.split(':');
  const hasEmbeddedPort = segments.length === 2 && /^\d+$/.test(segments[1]);
  const host = hasEmbeddedPort ? segments[0] : rawHost;
  const embeddedPort = hasEmbeddedPort ? segments[1] : undefined;

  const port = Number(env.REDIS_PORT || embeddedPort || 6379);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('REDIS_PORT must be a valid TCP port');
  }

  return {
    host,
    port,
    maxRetriesPerRequest: null,
  };
}
