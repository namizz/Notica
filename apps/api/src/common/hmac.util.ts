import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** Accepted clock difference for signed requests, both directions. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** A random credential such as `ngw_live_<43 base64url chars>`. */
export function randomToken(prefix: string, bytes = 32): string {
  return `${prefix}${randomBytes(bytes).toString('base64url')}`;
}

/**
 * A per-object secret derived from a server key, so it never has to be
 * stored: `prefix + base64url(HMAC-SHA256(masterKey, id))`. Rotating the
 * master key rotates every derived secret at once.
 */
export function deriveSecret(
  masterKey: string,
  prefix: string,
  id: string,
): string {
  return `${prefix}${createHmac('sha256', masterKey).update(id).digest('base64url')}`;
}

/** Hex HMAC-SHA256 over `"<timestamp>.<body>"`. */
export function computeSignature(
  secret: string,
  timestamp: string | number,
  body: string | Buffer,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest('hex');
}

/** The `X-Notica-Signature` / `v1=` header value for a request body. */
export function signatureHeader(
  secret: string,
  timestamp: string | number,
  body: string | Buffer,
): string {
  return `v1=${computeSignature(secret, timestamp, body)}`;
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type SignatureCheck =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'stale_timestamp' | 'mismatch' };

/**
 * Checks a `v1=<hex>` signature header (several comma-separated values are
 * allowed, for secret rotation) and that the timestamp is recent.
 */
export function verifySignature(options: {
  secret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  body: string | Buffer;
  nowMs?: number;
  toleranceSeconds?: number;
}): SignatureCheck {
  const { secret, timestamp, signature, body } = options;
  if (!timestamp || !signature) {
    return { ok: false, reason: 'missing' };
  }

  const seconds = Number(timestamp);
  const now = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const tolerance = options.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  if (!/^\d+$/.test(timestamp) || Math.abs(now - seconds) > tolerance) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const expected = computeSignature(secret, timestamp, body);
  const candidates = signature
    .split(/[\s,]+/)
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  return candidates.some((candidate) => safeEqual(candidate, expected))
    ? { ok: true }
    : { ok: false, reason: 'mismatch' };
}
