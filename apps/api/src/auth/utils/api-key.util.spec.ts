import {
  createApiKeyCredential,
  generateApiKey,
  getApiKeyPrefix,
  hashApiKey,
} from './api-key.util';

describe('API key utilities', () => {
  it('generates a namespaced high-entropy key', () => {
    expect(generateApiKey()).toMatch(/^ntc_live_[a-f0-9]{48}$/);
  });

  it('creates a deterministic SHA-256 hash without retaining the raw key', () => {
    const rawKey = 'ntc_live_0123456789abcdef0123456789abcdef0123456789abcdef';

    expect(hashApiKey(rawKey)).toBe(hashApiKey(rawKey));
    expect(hashApiKey(rawKey)).toHaveLength(64);
    expect(hashApiKey(rawKey)).not.toContain(rawKey);
  });

  it('returns only the namespace and first eight secret characters as a prefix', () => {
    const rawKey = 'ntc_live_0123456789abcdef0123456789abcdef0123456789abcdef';

    expect(getApiKeyPrefix(rawKey)).toBe('ntc_live_01234567');
  });

  it('returns matching raw, hash, and prefix credential parts', () => {
    const credential = createApiKeyCredential();

    expect(credential.hash).toBe(hashApiKey(credential.rawKey));
    expect(credential.prefix).toBe(getApiKeyPrefix(credential.rawKey));
  });
});
