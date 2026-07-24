import {
  ConflictException,
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { PlatformType } from '@prisma/client';
import { CurrentProject } from '../auth/decorators/current-project.decorator';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { ClientTokenPrincipal } from '../auth/strategies/client-token.strategy';
import { Req } from '@nestjs/common';
import { Request } from 'express';

interface ClientTokenRequest extends Request {
  user: ClientTokenPrincipal;
}

@ApiTags('Device Tokens')
@ApiSecurity('bearer')
@UseGuards(AuthGuard('client-token'))
@Controller('device-tokens')
export class DeviceTokensController {
  constructor(private prisma: PrismaService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register or update a device subscription token for Web Push',
  })
  @ApiResponse({
    status: 201,
    description: 'Device token registered successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async register(
    @CurrentTenant() tenantId: string,
    @CurrentProject() projectId: string,
    @Req() request: ClientTokenRequest,
    @Body() body: RegisterDeviceTokenDto,
  ) {
    const { recipientId } = request.user;
    const { token, platform } = body;

    // Normalize token to string
    const tokenString =
      typeof token === 'string' ? token : JSON.stringify(token);

    // 1. Find or create the recipient user under this tenant
    let recipientUser = await this.prisma.recipientUser.findUnique({
      where: {
        projectId_externalUserId: {
          projectId,
          externalUserId: recipientId,
        },
      },
    });

    if (!recipientUser) {
      recipientUser = await this.prisma.recipientUser.create({
        data: {
          tenantId,
          projectId,
          externalUserId: recipientId,
          name: `Recipient ${recipientId}`,
        },
      });
    }

    // 2. Upsert the device token
    const normalizedPlatform = platform ?? PlatformType.WEB;

    const existingToken = await this.prisma.deviceToken.findUnique({
      where: { token: tokenString },
    });

    if (existingToken && existingToken.projectId !== projectId) {
      throw new ConflictException(
        'This device subscription is already registered to another project',
      );
    }

    const deviceToken = await this.prisma.deviceToken.upsert({
      where: { token: tokenString },
      create: {
        tenantId,
        projectId,
        recipientUserId: recipientUser.id,
        token: tokenString,
        platform: normalizedPlatform,
      },
      update: {
        recipientUserId: recipientUser.id,
        tenantId,
        projectId,
        platform: normalizedPlatform,
      },
    });

    return {
      success: true,
      deviceId: deviceToken.id,
    };
  }

  @Get('vapid-key')
  @ApiOperation({
    summary: 'Get the VAPID public key for Web Push subscription',
  })
  @ApiResponse({
    status: 200,
    description: 'VAPID public key returned successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  getVapidKey() {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
    };
  }
}
