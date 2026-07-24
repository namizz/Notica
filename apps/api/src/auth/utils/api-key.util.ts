import * as crypto from 'crypto';

const API_KEY_NAMESPACE = 'ntc_live_';
const API_KEY_VISIBLE_CHARACTERS = 8;

export interface ApiKeyCredential {
  rawKey: string;
  hash: string;
  prefix: string;
}

export function generateApiKey(): string {
  return `${API_KEY_NAMESPACE}${crypto.randomBytes(24).toString('hex')}`;
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

export function getApiKeyPrefix(apiKey: string): string {
  return apiKey.slice(0, API_KEY_NAMESPACE.length + API_KEY_VISIBLE_CHARACTERS);
}

export function createApiKeyCredential(): ApiKeyCredential {
  const rawKey = generateApiKey();

  return {
    rawKey,
    hash: hashApiKey(rawKey),
    prefix: getApiKeyPrefix(rawKey),
  };
}
