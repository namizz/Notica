import { Injectable } from '@nestjs/common';
import { GatewayDevice, SmsStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GatewayPresenceService } from './gateway-presence.service';

/** Picks which paired phone of a project sends the next message. */
@Injectable()
export class GatewayRouter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: GatewayPresenceService,
  ) {}

  /** Paired, not revoked, and enabled devices of a project. */
  activeDevices(projectId: string, excludeId?: string) {
    return this.prisma.gatewayDevice.findMany({
      where: {
        projectId,
        tokenHash: { not: null },
        revokedAt: null,
        enabled: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  /**
   * Online devices first, the least busy one winning. With none online, the
   * most recently seen device gets the message and it waits in its queue
   * (maintenance moves it if another phone comes online first).
   */
  async pick(
    projectId: string,
    options: { onlineOnly?: boolean; excludeId?: string } = {},
  ): Promise<GatewayDevice | null> {
    const devices = await this.activeDevices(projectId, options.excludeId);
    if (devices.length === 0) {
      return null;
    }

    const online = await this.presence.onlineIds(devices.map((d) => d.id));
    const onlineDevices = devices.filter((device) => online.has(device.id));

    if (onlineDevices.length > 0) {
      const load = await this.prisma.smsMessage.groupBy({
        by: ['gatewayDeviceId'],
        where: {
          gatewayDeviceId: { in: onlineDevices.map((d) => d.id) },
          status: {
            in: [SmsStatus.QUEUED, SmsStatus.DISPATCHED, SmsStatus.ACCEPTED],
          },
        },
        _count: { _all: true },
      });
      const loadOf = (id: string) =>
        load.find((row) => row.gatewayDeviceId === id)?._count._all ?? 0;
      return [...onlineDevices].sort((a, b) => loadOf(a.id) - loadOf(b.id))[0];
    }

    if (options.onlineOnly) {
      return null;
    }
    return [...devices].sort(
      (a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0),
    )[0];
  }
}
