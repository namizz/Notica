import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import {
  CreateGatewayDeviceDto,
  UpdateGatewayDeviceDto,
} from './dto/gateway-device.dto';
import { GatewayDevicesService } from './gateway-devices.service';

@ApiTags('SMS Gateway devices')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/gateway-devices')
export class GatewayDevicesController {
  constructor(private readonly devices: GatewayDevicesService) {}

  @Post()
  @ApiOperation({
    summary: 'Add a gateway phone; returns a one-time pairing code and QR payload',
  })
  create(
    @CurrentTenant() tenantId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateGatewayDeviceDto,
  ) {
    return this.devices.create(tenantId, projectId, dto.name);
  }

  @Get()
  @ApiOperation({ summary: 'List gateway phones with online state and queue size' })
  list(@CurrentTenant() tenantId: string, @Param('projectId') projectId: string) {
    return this.devices.list(tenantId, projectId);
  }

  @Post(':id/pairing-code')
  @ApiOperation({ summary: 'Issue a new pairing code (to move to another phone)' })
  pairingCode(
    @CurrentTenant() tenantId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.devices.newPairingCode(tenantId, projectId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, set the default SIM, or enable/disable' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateGatewayDeviceDto,
  ) {
    return this.devices.update(tenantId, projectId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke the phone; it must be paired again to send' })
  revoke(
    @CurrentTenant() tenantId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.devices.revoke(tenantId, projectId, id);
  }
}
