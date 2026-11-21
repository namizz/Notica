import {
  computeSignature,
  deriveSecret,
  sha256Hex,
  signatureHeader,
  verifySignature,
} from './hmac.util';
import { maskPhone, normalizeE164 } from './phone.util';
import { analyzeSms } from './sms-segments.util';

describe('normalizeE164', () => {
  it('normalises international numbers with separators', () => {
    expect(normalizeE164('+251 91 123 4567')).toBe('+251911234567');
    expect(normalizeE164('+1 (415) 555-2671')).toBe('+14155552671');
  });

  it('rejects local, invalid or empty numbers', () => {
    expect(normalizeE164('0911234567')).toBeNull();
    expect(normalizeE164('+123')).toBeNull();
    expect(normalizeE164('')).toBeNull();
    expect(normalizeE164(undefined)).toBeNull();
    expect(normalizeE164('+251abc')).toBeNull();
  });
});

describe('maskPhone', () => {
  it('hides the middle digits', () => {
    expect(maskPhone('+251911234567')).toBe('+2519•••4567');
    expect(maskPhone(null)).toBe('unknown number');
  });
});

describe('analyzeSms', () => {
  it('fits 160 GSM characters in one part and splits at 161', () => {
    expect(analyzeSms('a'.repeat(160))).toEqual({
      encoding: 'GSM7',
      units: 160,
      parts: 1,
    });
    expect(analyzeSms('a'.repeat(161)).parts).toBe(2);
    expect(analyzeSms('a'.repeat(306)).parts).toBe(2);
    expect(analyzeSms('a'.repeat(307)).parts).toBe(3);
  });

  it('counts extension characters as two septets', () => {
    const info = analyzeSms('€'.repeat(80));
    expect(info).toEqual({ encoding: 'GSM7', units: 160, parts: 1 });
    expect(analyzeSms('€'.repeat(81)).parts).toBe(2);
  });

  it('switches to UCS-2 for other characters', () => {
    expect(analyzeSms('ሰላም')).toEqual({ encoding: 'UCS2', units: 3, parts: 1 });
    expect(analyzeSms('ሀ'.repeat(70)).parts).toBe(1);
    expect(analyzeSms('ሀ'.repeat(71)).parts).toBe(2);
  });

  it('counts an emoji as two UTF-16 units', () => {
    expect(analyzeSms('Hi 👋')).toEqual({ encoding: 'UCS2', units: 5, parts: 1 });
  });
});

describe('hmac utilities', () => {
  // Shared vector: apps/android-gateway RequestSignerTest checks the same value.
  const VECTOR = {
    secret: 'ngws_test_secret',
    timestamp: '1763546400',
    body: '{"events":[]}',
    hex: 'c9b4ad15d1e987dbd3baf516a5aff82622d44f243165b743d4dbe3e995706e43',
  };
  const nowMs = Number(VECTOR.timestamp) * 1000;

  it('matches the shared test vector', () => {
    expect(computeSignature(VECTOR.secret, VECTOR.timestamp, VECTOR.body)).toBe(
      VECTOR.hex,
    );
    expect(
      computeSignature(VECTOR.secret, VECTOR.timestamp, Buffer.from(VECTOR.body)),
    ).toBe(VECTOR.hex);
  });

  it('accepts a valid signature', () => {
    expect(
      verifySignature({
        secret: VECTOR.secret,
        timestamp: VECTOR.timestamp,
        signature: `v1=${VECTOR.hex}`,
        body: VECTOR.body,
        nowMs,
      }),
    ).toEqual({ ok: true });
  });

  it('accepts one valid value among several', () => {
    expect(
      verifySignature({
        secret: VECTOR.secret,
        timestamp: VECTOR.timestamp,
        signature: `v1=deadbeef, v1=${VECTOR.hex}`,
        body: VECTOR.body,
        nowMs,
      }).ok,
    ).toBe(true);
  });

  it('rejects a tampered body or wrong secret', () => {
    const base = {
      timestamp: VECTOR.timestamp,
      signature: signatureHeader(VECTOR.secret, VECTOR.timestamp, VECTOR.body),
      nowMs,
    };
    expect(
      verifySignature({ ...base, secret: VECTOR.secret, body: '{"events":[1]}' }),
    ).toEqual({ ok: false, reason: 'mismatch' });
    expect(
      verifySignature({ ...base, secret: 'other', body: VECTOR.body }),
    ).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects stale or missing timestamps', () => {
    const signature = signatureHeader(
      VECTOR.secret,
      VECTOR.timestamp,
      VECTOR.body,
    );
    expect(
      verifySignature({
        secret: VECTOR.secret,
        timestamp: VECTOR.timestamp,
        signature,
        body: VECTOR.body,
        nowMs: nowMs + 301_000,
      }),
    ).toEqual({ ok: false, reason: 'stale_timestamp' });
    expect(
      verifySignature({
        secret: VECTOR.secret,
        timestamp: undefined,
        signature,
        body: VECTOR.body,
      }),
    ).toEqual({ ok: false, reason: 'missing' });
  });

  it('derives stable secrets per id', () => {
    const a = deriveSecret('master-key', 'ngws_', 'device-1');
    expect(a).toMatch(/^ngws_[A-Za-z0-9_-]{43}$/);
    expect(deriveSecret('master-key', 'ngws_', 'device-1')).toBe(a);
    expect(deriveSecret('master-key', 'ngws_', 'device-2')).not.toBe(a);
    expect(sha256Hex('x')).toHaveLength(64);
  });
});
