import { HttpStatus } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { ChannelRequestError } from './channel-errors';
import { ChannelHandler } from './channel-handler.interface';
import { ChannelRegistry } from './channel-registry';

describe('ChannelRegistry', () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
  });

  const mockHandler = (
    channel: ChannelType,
    enabled = true,
  ): ChannelHandler => ({
    channel,
    isEnabled: () => enabled,
    providerName: () => (enabled ? 'mock-provider' : null),
    deliver: jest.fn(),
  });

  it('registers and retrieves handlers', () => {
    const handler = mockHandler(ChannelType.EMAIL);
    registry.register(handler);

    expect(registry.get(ChannelType.EMAIL)).toBe(handler);
    expect(registry.list()).toEqual([handler]);
  });

  it('throws when registering the same channel twice', () => {
    registry.register(mockHandler(ChannelType.EMAIL));
    expect(() => registry.register(mockHandler(ChannelType.EMAIL))).toThrow(
      'Channel EMAIL is registered twice',
    );
  });

  it('identifies built-in channels', () => {
    expect(registry.isBuiltIn(ChannelType.IN_APP)).toBe(true);
    expect(registry.isBuiltIn(ChannelType.WEB_PUSH)).toBe(true);
    expect(registry.isBuiltIn(ChannelType.EMAIL)).toBe(false);
    expect(registry.isBuiltIn(ChannelType.SMS)).toBe(false);
  });

  it('returns handler when channel is enabled via requireEnabled', () => {
    const handler = mockHandler(ChannelType.SMS, true);
    registry.register(handler);

    expect(registry.requireEnabled(ChannelType.SMS)).toBe(handler);
  });

  it('throws ChannelRequestError (400) when channel is not enabled or not registered', () => {
    const disabledHandler = mockHandler(ChannelType.SMS, false);
    registry.register(disabledHandler);

    expect(() => registry.requireEnabled(ChannelType.SMS)).toThrow(
      ChannelRequestError,
    );
    try {
      registry.requireEnabled(ChannelType.SMS);
    } catch (err) {
      expect(err).toBeInstanceOf(ChannelRequestError);
      const reqErr = err as ChannelRequestError;
      expect(reqErr.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(reqErr.code).toBe('CHANNEL_NOT_ENABLED');
    }

    expect(() => registry.requireEnabled(ChannelType.EMAIL)).toThrow(
      ChannelRequestError,
    );
  });
});
