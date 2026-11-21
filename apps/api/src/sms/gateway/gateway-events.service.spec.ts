import { GatewayDevice, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsOutboxService } from '../sms-outbox.service';
import { DeviceEvent } from '../sms-wire';
import { GatewayDispatcher } from './gateway-dispatcher.service';
import { GatewayEventsService } from './gateway-events.service';

describe('GatewayEventsService', () => {
  const gatewayEvent = {
    create: jest.fn(),
    delete: jest.fn(),
  };
  const smsMessage = {
    findFirst: jest.fn(),
  };
  const gatewayDevice = {
    update: jest.fn(),
  };
  const outbox = {
    transition: jest.fn(),
  };
  const dispatcher = {
    dispatchSoon: jest.fn(),
  };

  const service = new GatewayEventsService(
    {
      gatewayEvent,
      smsMessage,
      gatewayDevice,
    } as unknown as PrismaService,
    outbox as unknown as SmsOutboxService,
    dispatcher as unknown as GatewayDispatcher,
  );

  const sampleDevice: GatewayDevice = {
    id: 'device-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    name: 'Pixel 7',
    tokenHash: 'hash',
    pairingCodeHash: null,
    pairingExpiresAt: null,
    pairedAt: new Date(),
    model: 'Pixel 7',
    androidSdk: 34,
    appVersion: '1.0.0',
    sims: null,
    defaultSimSlot: 0,
    enabled: true,
    lastSeenAt: null,
    lastHeartbeat: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    gatewayEvent.create.mockResolvedValue({});
    gatewayEvent.delete.mockResolvedValue({});
    gatewayDevice.update.mockResolvedValue({});
    outbox.transition.mockResolvedValue({});
  });

  it('accepts duplicate eventId without reprocessing', async () => {
    const p2002Error = new Prisma.PrismaClientKnownRequestError('Duplicate key', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    gatewayEvent.create.mockRejectedValueOnce(p2002Error);

    const event: DeviceEvent = {
      eventId: 'evt-dup',
      type: 'sms:accepted',
      messageId: 'msg-1',
      occurredAt: new Date().toISOString(),
    };

    const res = await service.ingest(sampleDevice, [event]);
    expect(res.accepted).toContain('evt-dup');
    expect(smsMessage.findFirst).not.toHaveBeenCalled();
    expect(outbox.transition).not.toHaveBeenCalled();
  });

  it('rejects event with unknown_message when message does not belong to device', async () => {
    gatewayEvent.create.mockResolvedValueOnce({});
    smsMessage.findFirst.mockResolvedValueOnce(null);

    const event: DeviceEvent = {
      eventId: 'evt-unknown',
      type: 'sms:sent',
      messageId: 'msg-not-mine',
      occurredAt: new Date().toISOString(),
    };

    const res = await service.ingest(sampleDevice, [event]);
    expect(res.rejected).toEqual([
      { eventId: 'evt-unknown', reason: 'unknown_message' },
    ]);
    expect(outbox.transition).not.toHaveBeenCalled();
  });

  it('processes event and calls transition on valid message', async () => {
    gatewayEvent.create.mockResolvedValueOnce({});
    smsMessage.findFirst.mockResolvedValueOnce({ id: 'msg-1' });

    const event: DeviceEvent = {
      eventId: 'evt-valid',
      type: 'sms:delivered',
      messageId: 'msg-1',
      occurredAt: new Date().toISOString(),
      data: { tpStatus: 0 },
    };

    const res = await service.ingest(sampleDevice, [event]);
    expect(res.accepted).toContain('evt-valid');
    expect(outbox.transition).toHaveBeenCalledWith(
      'msg-1',
      expect.objectContaining({ kind: 'delivered' }),
      { deviceId: 'device-1' },
    );
    expect(dispatcher.dispatchSoon).toHaveBeenCalledWith('device-1');
  });

  it('deletes event record if outbox transition throws an error', async () => {
    gatewayEvent.create.mockResolvedValueOnce({});
    smsMessage.findFirst.mockResolvedValueOnce({ id: 'msg-1' });
    outbox.transition.mockRejectedValueOnce(new Error('DB failure'));

    const event: DeviceEvent = {
      eventId: 'evt-fail',
      type: 'sms:sent',
      messageId: 'msg-1',
      occurredAt: new Date().toISOString(),
    };

    const res = await service.ingest(sampleDevice, [event]);
    expect(res.accepted).not.toContain('evt-fail');
    expect(res.rejected).not.toContainEqual(
      expect.objectContaining({ eventId: 'evt-fail' }),
    );
    expect(gatewayEvent.delete).toHaveBeenCalledWith({
      where: { id: 'evt-fail' },
    });
  });
});
