import { HttpStatus, NotFoundException } from '@nestjs/common';
import { GatewayDevice } from '@prisma/client';
import { ChannelRequestError } from '../../channels/channel-errors';
import { sha256Hex } from '../../common/hmac.util';
import { PrismaService } from '../../prisma/prisma.service';
import { GatewayDevicesService, normalizePairingCode } from './gateway-devices.service';
import { GatewayDispatcher } from './gateway-dispatcher.service';
import { GatewayPresenceService } from './gateway-presence.service';

describe('GatewayDevicesService', () => {
  const project = { findFirst: jest.fn() };
  const gatewayDevice = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  };
  const smsMessage = { groupBy: jest.fn() };
  const presence = {
    markOffline: jest.fn(),
    onlineIds: jest.fn().mockResolvedValue(new Set()),
  };
  const dispatcher = {
    revoke: jest.fn(),
    disconnect: jest.fn(),
  };

  const service = new GatewayDevicesService(
    {
      project,
      gatewayDevice,
      smsMessage,
    } as unknown as PrismaService,
    presence as unknown as GatewayPresenceService,
    dispatcher as unknown as GatewayDispatcher,
  );

  const sampleDevice: GatewayDevice = {
    id: 'device-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    name: 'Office Phone',
    tokenHash: null,
    pairingCodeHash: sha256Hex('K7PQ2XMD'),
    pairingExpiresAt: new Date(Date.now() + 600000),
    pairedAt: null,
    model: null,
    androidSdk: null,
    appVersion: null,
    sims: null,
    defaultSimSlot: null,
    enabled: true,
    lastSeenAt: null,
    lastHeartbeat: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    project.findFirst.mockResolvedValue({ id: 'project-1' });
    process.env.GATEWAY_SIGNING_KEY = 'test-signing-key-for-gateway-devices-unit-tests';
  });

  describe('create and pair', () => {
    it('generates pairing code and returns QR url', async () => {
      gatewayDevice.create.mockResolvedValueOnce(sampleDevice);

      const result = await service.create('tenant-1', 'project-1', 'Office Phone');
      expect(result.pairingCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
      expect(result.qr).toContain('notica-gw://pair');
      expect(gatewayDevice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Office Phone',
            tenantId: 'tenant-1',
            projectId: 'project-1',
          }),
        }),
      );
    });

    it('pairs successfully with valid code and returns credentials', async () => {
      gatewayDevice.findFirst.mockResolvedValueOnce(sampleDevice);
      gatewayDevice.updateMany.mockResolvedValueOnce({ count: 1 });

      const pairDto = {
        code: 'K7PQ-2XMD',
        device: {
          model: 'Pixel 7',
          androidSdk: 34,
          appVersion: '1.0.0',
          sims: [{ slot: 0, subscriptionId: 1, carrier: 'Safaricom' }],
        },
      };

      const res = await service.pair(pairDto);
      expect(res.deviceId).toBe('device-1');
      expect(res.deviceToken).toMatch(/^ngw_live_/);
      expect(res.signingSecret).toMatch(/^ngws_/);
      expect(dispatcher.disconnect).toHaveBeenCalledWith('device-1');
    });

    it('throws INVALID_PAIRING_CODE when code is not found or expired', async () => {
      gatewayDevice.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.pair({
          code: 'EXPIRED1',
          device: { model: 'P1', androidSdk: 30, appVersion: '1.0' },
        }),
      ).rejects.toThrow(ChannelRequestError);
    });

    it('enforces single use of pairing code (updateMany count !== 1)', async () => {
      gatewayDevice.findFirst.mockResolvedValueOnce(sampleDevice);
      gatewayDevice.updateMany.mockResolvedValueOnce({ count: 0 }); // already claimed concurrently

      await expect(
        service.pair({
          code: 'K7PQ-2XMD',
          device: { model: 'P1', androidSdk: 30, appVersion: '1.0' },
        }),
      ).rejects.toThrow(ChannelRequestError);
    });
  });

  describe('revoke', () => {
    it('sets revokedAt, disconnects and revokes device', async () => {
      gatewayDevice.findFirst.mockResolvedValueOnce(sampleDevice);
      gatewayDevice.update.mockResolvedValueOnce({
        ...sampleDevice,
        revokedAt: new Date(),
        tokenHash: null,
      });

      const res = await service.revoke('tenant-1', 'project-1', 'device-1');
      expect(res.paired).toBe(false);
      expect(presence.markOffline).toHaveBeenCalledWith('device-1');
      expect(dispatcher.revoke).toHaveBeenCalledWith('device-1');
    });
  });

  describe('authenticate', () => {
    it('returns null for missing or invalid token prefix', async () => {
      expect(await service.authenticate('')).toBeNull();
      expect(await service.authenticate('invalid_token')).toBeNull();
    });

    it('returns null if device is revoked', async () => {
      gatewayDevice.findUnique.mockResolvedValueOnce({
        ...sampleDevice,
        revokedAt: new Date(),
      });
      const res = await service.authenticate('ngw_live_testtoken');
      expect(res).toBeNull();
    });

    it('returns device when active token matches', async () => {
      gatewayDevice.findUnique.mockResolvedValueOnce(sampleDevice);
      const res = await service.authenticate('ngw_live_validtoken');
      expect(res).toEqual(sampleDevice);
    });
  });
});
