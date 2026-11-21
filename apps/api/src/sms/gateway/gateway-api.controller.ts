import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { GatewayDevice } from '@prisma/client';
import { SmsOutboxService, toWireMessage } from '../sms-outbox.service';
import type { DeviceEvent, EventsResult } from '../sms-wire';
import {
  CurrentGatewayDevice,
  DeviceAuthGuard,
  GatewaySignatureGuard,
} from './device-auth.guard';
import { DeviceEventsDto } from './dto/device-events.dto';
import { PairDeviceDto } from './dto/pair-device.dto';
import { DISPATCH_BATCH_SIZE } from './gateway-dispatcher.service';
import { GatewayDevicesService } from './gateway-devices.service';
import { GatewayEventsService } from './gateway-events.service';

/**
 * The HTTP side of the gateway protocol, called by the Android app.
 * Not for browsers or API keys: phones authenticate with their own token.
 */
@ApiTags('SMS Gateway (device API)')
@Controller('gateway/v1')
export class GatewayApiController {
  constructor(
    private readonly devices: GatewayDevicesService,
    private readonly outbox: SmsOutboxService,
    private readonly events: GatewayEventsService,
  ) {}

  @Post('pair')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Exchange a one-time pairing code for device credentials' })
  pair(@Body() dto: PairDeviceDto) {
    return this.devices.pair(dto);
  }

  @Get('me')
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'The authenticated device and its settings' })
  me(@CurrentGatewayDevice() device: GatewayDevice) {
    return {
      deviceId: device.id,
      projectId: device.projectId,
      name: device.name,
      enabled: device.enabled,
      defaultSimSlot: device.defaultSimSlot,
      serverTime: new Date().toISOString(),
    };
  }

  @Get('messages/pending')
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Pull queued messages (fallback when the socket is down)' })
  async pending(
    @CurrentGatewayDevice() device: GatewayDevice,
    @Query('limit', new DefaultValuePipe(DISPATCH_BATCH_SIZE), ParseIntPipe)
    limit: number,
  ) {
    const leased = await this.outbox.lease(
      device.id,
      Math.min(Math.max(limit, 1), DISPATCH_BATCH_SIZE),
    );
    return { messages: leased.map(toWireMessage) };
  }

  @Post('events')
  @HttpCode(200)
  @UseGuards(DeviceAuthGuard, GatewaySignatureGuard)
  @ApiOperation({ summary: 'Signed status webhooks: accepted, sent, delivered, failed' })
  ingest(
    @CurrentGatewayDevice() device: GatewayDevice,
    @Body() dto: DeviceEventsDto,
  ): Promise<EventsResult> {
    return this.events.ingest(device, dto.events as DeviceEvent[]);
  }
}
