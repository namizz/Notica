import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Prisma } from '@prisma/client';
import type { Namespace, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { WebhooksService } from '../../webhooks/webhooks.service';
import {
  deviceRoom,
  GATEWAY_NAMESPACE,
  GATEWAY_PROTOCOL_MAJOR,
  SOCKET_EVENTS,
} from '../sms-wire';
import { GatewayDevicesService } from './gateway-devices.service';
import { GatewayDispatcher } from './gateway-dispatcher.service';
import { GatewayPresenceService } from './gateway-presence.service';

interface DeviceSocketData {
  deviceId: string;
  tenantId: string;
  projectId: string;
  name: string;
}

interface HeartbeatPayload {
  battery?: number;
  charging?: boolean;
  network?: string;
  signalLevel?: number;
  outboxDepth?: number;
  pendingEvents?: number;
  appVersion?: string;
}

function sanitizeHeartbeat(payload: unknown): HeartbeatPayload {
  const value = (payload ?? {}) as Record<string, unknown>;
  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  return {
    battery: num(value.battery),
    charging: typeof value.charging === 'boolean' ? value.charging : undefined,
    network: typeof value.network === 'string' ? value.network.slice(0, 20) : undefined,
    signalLevel: num(value.signalLevel),
    outboxDepth: num(value.outboxDepth),
    pendingEvents: num(value.pendingEvents),
    appVersion:
      typeof value.appVersion === 'string' ? value.appVersion.slice(0, 32) : undefined,
  };
}

/**
 * The `/gateway` socket.io namespace. Phones connect out to it with their
 * device token; Notica pushes `sms:send` batches down this connection. Every
 * status report comes back over HTTPS webhooks, not this socket.
 */
@WebSocketGateway({ namespace: GATEWAY_NAMESPACE, cors: { origin: '*' } })
export class GatewaySocket
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(GatewaySocket.name);
  private namespace: Namespace | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: GatewayDevicesService,
    private readonly dispatcher: GatewayDispatcher,
    private readonly presence: GatewayPresenceService,
    private readonly realtime: RealtimeGateway,
    private readonly webhooks: WebhooksService,
  ) {}

  afterInit(namespace: Namespace) {
    this.namespace = namespace;
    this.dispatcher.attach(namespace);
  }

  async handleConnection(client: Socket) {
    const auth = client.handshake.auth as { token?: unknown; version?: unknown };
    const version = typeof auth.version === 'string' ? auth.version : undefined;
    if (version && Number(version.split('.')[0]) !== GATEWAY_PROTOCOL_MAJOR) {
      client.emit(SOCKET_EVENTS.error, { code: 'UNSUPPORTED_GATEWAY_VERSION' });
      client.disconnect(true);
      return;
    }

    const device = await this.devices
      .authenticate(typeof auth.token === 'string' ? auth.token : undefined)
      .catch(() => null);
    if (!device) {
      client.emit(SOCKET_EVENTS.error, { code: 'DEVICE_UNAUTHORIZED' });
      client.disconnect(true);
      return;
    }

    const data: DeviceSocketData = {
      deviceId: device.id,
      tenantId: device.tenantId,
      projectId: device.projectId,
      name: device.name,
    };
    client.data = data;
    await client.join(deviceRoom(device.id));
    await this.presence.markOnline(device.id);
    await this.prisma.gatewayDevice
      .update({
        where: { id: device.id },
        data: { lastSeenAt: new Date(), ...(version ? { appVersion: version } : {}) },
      })
      .catch(() => undefined);

    this.logger.log(`Gateway ${device.name} (${device.id}) connected`);
    this.realtime.sendLogToProject(device.tenantId, device.projectId, {
      timestamp: new Date(),
      type: 'info',
      message: `SMS gateway "${device.name}" is online`,
      channel: 'SMS',
    });
    void this.webhooks.publish(device.tenantId, device.projectId, 'gateway.online', {
      deviceId: device.id,
      name: device.name,
    });

    this.dispatcher.dispatchSoon(device.id);
  }

  async handleDisconnect(client: Socket) {
    const data = client.data as Partial<DeviceSocketData>;
    if (!data?.deviceId || !this.namespace) {
      return;
    }
    // The same phone may have reconnected on another socket already.
    const remaining = await this.namespace
      .in(deviceRoom(data.deviceId))
      .fetchSockets()
      .catch(() => []);
    if (remaining.length > 0) {
      return;
    }

    await this.presence.markOffline(data.deviceId);
    this.logger.log(`Gateway ${data.name} (${data.deviceId}) disconnected`);
    this.realtime.sendLogToProject(data.tenantId!, data.projectId!, {
      timestamp: new Date(),
      type: 'warning',
      message: `SMS gateway "${data.name}" went offline`,
      channel: 'SMS',
    });
    void this.webhooks.publish(data.tenantId!, data.projectId!, 'gateway.offline', {
      deviceId: data.deviceId,
      name: data.name,
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.heartbeat)
  async heartbeat(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    const data = client.data as Partial<DeviceSocketData>;
    if (!data?.deviceId) {
      return { ok: false };
    }
    const heartbeat = sanitizeHeartbeat(payload);
    await this.presence.markOnline(data.deviceId);
    await this.prisma.gatewayDevice
      .update({
        where: { id: data.deviceId },
        data: {
          lastSeenAt: new Date(),
          lastHeartbeat: {
            ...heartbeat,
            at: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
    return { ok: true, serverTime: new Date().toISOString() };
  }
}
