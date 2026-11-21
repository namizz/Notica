import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Blocks webhook URLs that would make the server call itself or a private
 * network (SSRF). Production also requires https.
 */
export async function assertSafeWebhookUrl(
  raw: string,
  options: { production: boolean; resolve?: typeof lookup } = {
    production: process.env.NODE_ENV === 'production',
  },
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Webhook URL is not a valid URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Webhook URL must use https');
  }
  if (!options.production) {
    return url;
  }
  if (url.protocol !== 'https:') {
    throw new Error('Webhook URL must use https');
  }
  if (url.username || url.password) {
    throw new Error('Webhook URL must not contain credentials');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [host]
    : (await (options.resolve ?? lookup)(host, { all: true })).map(
        (entry) => entry.address,
      );

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error('Webhook URL must resolve to a public address');
  }
  return url;
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower.startsWith('::ffff:')) {
      return isPrivateAddress(lower.slice(7));
    }
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    );
  }
  return true;
}
