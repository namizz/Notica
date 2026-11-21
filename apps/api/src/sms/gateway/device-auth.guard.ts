import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import type { GatewayDevice } from '@prisma/client';
import type { Request } from 'express';
import { verifySignature } from '../../common/hmac.util';
import { GATEWAY_PROTOCOL_MAJOR } from '../sms-wire';
import { GatewayDevicesService } from './gateway-devices.service';

export interface GatewayRequest extends Request {
  gatewayDevice?: GatewayDevice;
  rawBody?: Buffer;
}

function reject(status: HttpStatus, code: string, message: string): never {
  throw new HttpException({ statusCode: status, error: code, message }, status);
}

/** Authenticates a gateway phone by its `Authorization: Bearer` token. */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly devices: GatewayDevicesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GatewayRequest>();

    const version = request.header('x-notica-gateway-version');
    if (version && Number(version.split('.')[0]) !== GATEWAY_PROTOCOL_MAJOR) {
      reject(
        (HttpStatus as any).UPGRADE_REQUIRED ?? 426,
        'UNSUPPORTED_GATEWAY_VERSION',
        `This server speaks gateway protocol v${GATEWAY_PROTOCOL_MAJOR}; update the app`,
      );
    }

    const header = request.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const device = await this.devices.authenticate(token);
    if (!device) {
      reject(
        HttpStatus.UNAUTHORIZED,
        'DEVICE_UNAUTHORIZED',
        'Unknown or revoked gateway device; pair the app again',
      );
    }
    request.gatewayDevice = device;
    return true;
  }
}

/**
 * Checks `X-Notica-Signature: v1=<hex HMAC-SHA256(secret, "ts.rawBody")>` and
 * `X-Notica-Timestamp`. Runs after DeviceAuthGuard, which identifies whose
 * secret to use. Needs the raw body (NestFactory `rawBody: true`).
 */
@Injectable()
export class GatewaySignatureGuard implements CanActivate {
  constructor(private readonly devices: GatewayDevicesService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    const device = request.gatewayDevice;
    if (!device || !request.rawBody) {
      reject(HttpStatus.UNAUTHORIZED, 'INVALID_SIGNATURE', 'Missing signed body');
    }

    const check = verifySignature({
      secret: this.devices.signingSecret(device.id),
      timestamp: request.header('x-notica-timestamp'),
      signature: request.header('x-notica-signature'),
      body: request.rawBody,
    });
    if (!check.ok) {
      reject(
        HttpStatus.UNAUTHORIZED,
        'INVALID_SIGNATURE',
        check.reason === 'stale_timestamp'
          ? 'Request timestamp is outside the allowed 5 minute window; check the phone clock'
          : 'Request signature is missing or wrong',
      );
    }
    return true;
  }
}

export const CurrentGatewayDevice = createParamDecorator(
  (_data: unknown, context: ExecutionContext): GatewayDevice | undefined =>
    context.switchToHttp().getRequest<GatewayRequest>().gatewayDevice,
);
