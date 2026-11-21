import {
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GatewayDevice, Prisma, SmsStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ChannelRequestError } from '../../channels/channel-errors';
import { deriveSecret, randomToken, sha256Hex } from '../../common/hmac.util';
import {
  gatewaySigningKey,
  publicApiUrl,
} from '../../config/environment';
import { PrismaService } from '../../prisma/prisma.service';
import { GATEWAY_NAMESPACE } from '../sms-wire';
import { GatewayDispatcher } from './gateway-dispatcher.service';
import { GatewayPresenceService } from './gateway-presence.service';
import type { PairDeviceDto } from './dto/pair-device.dto';
import type { UpdateGatewayDeviceDto } from './dto/gateway-device.dto';

export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const TOKEN_PREFIX = 'ngw_live_';
const SECRET_PREFIX = 'ngws_';
// Crockford base32 without I, L, O, U: easy to read and type.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `K7PQ-2XMD`: 8 characters, 40 bits. */
export function generatePairingCode(): string {
  const bytes = randomBytes(8);
  const chars = [...bytes].map((byte) => CODE_ALPHABET[byte % 32]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export function normalizePairingCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** What a dashboard sees for a device; never the token hash. */
function publicDevice(device: GatewayDevice) {
  const { tokenHash, pairingCodeHash, ...rest } = device;
  return {
    ...rest,
    paired: tokenHash !== null && device.revokedAt === null,
    pairingPending: pairingCodeHash !== null,
  };
}

@Injectable()
export class GatewayDevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: GatewayPresenceService,
    private readonly dispatcher: GatewayDispatcher,
  ) {}

  private signingKey(): string {
    const key = gatewaySigningKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'SMS gateway is not configured on this server (GATEWAY_SIGNING_KEY)',
      );
    }
    return key;
  }

  signingSecret(deviceId: string): string {
    return deriveSecret(this.signingKey(), SECRET_PREFIX, deviceId);
  }

  private async assertProject(tenantId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  private async findDevice(tenantId: string, projectId: string, id: string) {
    const device = await this.prisma.gatewayDevice.findFirst({
      where: { id, tenantId, projectId },
    });
    if (!device) {
      throw new NotFoundException('Gateway device not found');
    }
    return device;
  }

  private pairingResponse(device: GatewayDevice, code: string) {
    const server = publicApiUrl();
    return {
      device: publicDevice(device),
      pairingCode: code,
      expiresAt: device.pairingExpiresAt,
      server,
      qr: `notica-gw://pair?server=${encodeURIComponent(server)}&code=${code}`,
    };
  }

  /** Creates a device slot and a one-time pairing code for its QR. */
  async create(tenantId: string, projectId: string, name: string) {
    await this.assertProject(tenantId, projectId);
    this.signingKey();
    const code = generatePairingCode();
    const device = await this.prisma.gatewayDevice.create({
      data: {
        tenantId,
        projectId,
        name,
        pairingCodeHash: sha256Hex(normalizePairingCode(code)),
        pairingExpiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS),
      },
    });
    return this.pairingResponse(device, code);
  }

  /** A new pairing code for an existing device (replaces its phone/token). */
  async newPairingCode(tenantId: string, projectId: string, id: string) {
    await this.findDevice(tenantId, projectId, id);
    const code = generatePairingCode();
    const device = await this.prisma.gatewayDevice.update({
      where: { id },
      data: {
        pairingCodeHash: sha256Hex(normalizePairingCode(code)),
        pairingExpiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS),
        revokedAt: null,
      },
    });
    return this.pairingResponse(device, code);
  }

  async list(tenantId: string, projectId: string) {
    await this.assertProject(tenantId, projectId);
    const devices = await this.prisma.gatewayDevice.findMany({
      where: { tenantId, projectId },
      orderBy: { createdAt: 'asc' },
    });
    const online = await this.presence.onlineIds(devices.map((d) => d.id));

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [queued, sentToday] = await Promise.all([
      this.prisma.smsMessage.groupBy({
        by: ['gatewayDeviceId'],
        where: {
          projectId,
          status: {
            in: [SmsStatus.QUEUED, SmsStatus.DISPATCHED, SmsStatus.ACCEPTED],
          },
        },
        _count: { _all: true },
      }),
      this.prisma.smsMessage.groupBy({
        by: ['gatewayDeviceId'],
        where: {
          projectId,
          sentAt: { gte: startOfDay },
        },
        _count: { _all: true },
      }),
    ]);
    const countFor = (
      rows: { gatewayDeviceId: string | null; _count: { _all: number } }[],
      id: string,
    ) => rows.find((row) => row.gatewayDeviceId === id)?._count._all ?? 0;

    return devices.map((device) => ({
      ...publicDevice(device),
      online: online.has(device.id),
      queued: countFor(queued, device.id),
      sentToday: countFor(sentToday, device.id),
    }));
  }

  async update(
    tenantId: string,
    projectId: string,
    id: string,
    dto: UpdateGatewayDeviceDto,
  ) {
    await this.findDevice(tenantId, projectId, id);
    const device = await this.prisma.gatewayDevice.update({
      where: { id },
      data: dto,
    });
    return publicDevice(device);
  }

  /** Revokes the phone's credentials and disconnects it. */
  async revoke(tenantId: string, projectId: string, id: string) {
    await this.findDevice(tenantId, projectId, id);
    const device = await this.prisma.gatewayDevice.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        tokenHash: null,
        pairingCodeHash: null,
        pairingExpiresAt: null,
      },
    });
    await this.presence.markOffline(id);
    this.dispatcher.revoke(id);
    return publicDevice(device);
  }

  /** Called by the phone with the code from the QR. Single use. */
  async pair(dto: PairDeviceDto) {
    const codeHash = sha256Hex(normalizePairingCode(dto.code));
    const device = await this.prisma.gatewayDevice.findFirst({
      where: {
        pairingCodeHash: codeHash,
        pairingExpiresAt: { gt: new Date() },
      },
    });
    if (!device) {
      throw new ChannelRequestError(
        HttpStatus.BAD_REQUEST,
        'INVALID_PAIRING_CODE',
        'The pairing code is invalid or has expired. Create a new one in the dashboard.',
      );
    }

    const token = randomToken(TOKEN_PREFIX);
    const claimed = await this.prisma.gatewayDevice.updateMany({
      where: { id: device.id, pairingCodeHash: codeHash },
      data: {
        tokenHash: sha256Hex(token),
        pairingCodeHash: null,
        pairingExpiresAt: null,
        pairedAt: new Date(),
        revokedAt: null,
        lastSeenAt: new Date(),
        model: dto.device.model,
        androidSdk: dto.device.androidSdk,
        appVersion: dto.device.appVersion,
        sims: (dto.device.sims ?? []) as unknown as Prisma.InputJsonValue,
      },
    });
    if (claimed.count !== 1) {
      throw new ChannelRequestError(
        HttpStatus.BAD_REQUEST,
        'INVALID_PAIRING_CODE',
        'The pairing code was already used.',
      );
    }

    // A re-paired device may still hold a socket with its old token.
    this.dispatcher.disconnect(device.id);

    const server = publicApiUrl();
    return {
      deviceId: device.id,
      projectId: device.projectId,
      name: device.name,
      deviceToken: token,
      signingSecret: this.signingSecret(device.id),
      server,
      socketUrl: `${server}${GATEWAY_NAMESPACE}`,
      heartbeatSeconds: 30,
      pullIntervalMinutes: 15,
    };
  }

  /** Resolves a bearer token to its active device, or null. */
  async authenticate(token: string | undefined): Promise<GatewayDevice | null> {
    if (!token || !token.startsWith(TOKEN_PREFIX)) {
      return null;
    }
    const device = await this.prisma.gatewayDevice.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (!device || device.revokedAt) {
      return null;
    }
    return device;
  }
}
