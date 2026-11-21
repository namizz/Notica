import { assertSafeWebhookUrl, isPrivateAddress } from './url-guard';

describe('url-guard', () => {
  describe('isPrivateAddress', () => {
    it('identifies private IPv4 addresses', () => {
      expect(isPrivateAddress('127.0.0.1')).toBe(true);
      expect(isPrivateAddress('10.0.0.5')).toBe(true);
      expect(isPrivateAddress('192.168.1.1')).toBe(true);
      expect(isPrivateAddress('172.16.0.1')).toBe(true);
      expect(isPrivateAddress('172.31.255.255')).toBe(true);
      expect(isPrivateAddress('169.254.169.254')).toBe(true);
      expect(isPrivateAddress('0.0.0.0')).toBe(true);
    });

    it('identifies public IPv4 addresses', () => {
      expect(isPrivateAddress('8.8.8.8')).toBe(false);
      expect(isPrivateAddress('1.1.1.1')).toBe(false);
      expect(isPrivateAddress('93.184.216.34')).toBe(false);
    });

    it('identifies private IPv6 addresses', () => {
      expect(isPrivateAddress('::1')).toBe(true);
      expect(isPrivateAddress('::')).toBe(true);
      expect(isPrivateAddress('fc00::1')).toBe(true);
      expect(isPrivateAddress('fd12:3456:789a::1')).toBe(true);
      expect(isPrivateAddress('fe80::1')).toBe(true);
      expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    });

    it('identifies public IPv6 addresses', () => {
      expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
    });
  });

  describe('assertSafeWebhookUrl', () => {
    it('allows http in development', async () => {
      const url = await assertSafeWebhookUrl('http://localhost:3000/webhook', {
        production: false,
      });
      expect(url.href).toBe('http://localhost:3000/webhook');
    });

    it('rejects non-https in production', async () => {
      await expect(
        assertSafeWebhookUrl('http://example.com/webhook', {
          production: true,
        }),
      ).rejects.toThrow('Webhook URL must use https');
    });

    it('rejects credentials in URL', async () => {
      await expect(
        assertSafeWebhookUrl('https://user:pass@example.com/webhook', {
          production: true,
        }),
      ).rejects.toThrow('Webhook URL must not contain credentials');
    });

    it('rejects private IP resolution in production', async () => {
      const mockResolve = jest.fn().mockResolvedValue([{ address: '127.0.0.1' }]);
      await expect(
        assertSafeWebhookUrl('https://internal.service/webhook', {
          production: true,
          resolve: mockResolve as any,
        }),
      ).rejects.toThrow('Webhook URL must resolve to a public address');
    });

    it('accepts public address in production', async () => {
      const mockResolve = jest.fn().mockResolvedValue([{ address: '93.184.216.34' }]);
      const url = await assertSafeWebhookUrl('https://example.com/webhook', {
        production: true,
        resolve: mockResolve as any,
      });
      expect(url.hostname).toBe('example.com');
    });
  });
});
