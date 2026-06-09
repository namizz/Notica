import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { PlatformType } from '@prisma/client';

@ApiTags('Device Tokens')
@ApiSecurity('api-key')
@UseGuards(AuthGuard('api-key'))
@Controller('device-tokens')
export class DeviceTokensController {
  constructor(private prisma: PrismaService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register or update a device subscription token for Web Push' })
  @ApiResponse({ status: 201, description: 'Device token registered successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async register(
    @CurrentTenant() tenantId: string,
    @Body() body: { recipientId: string; token: string | any; platform?: string },
  ) {
    const { recipientId, token, platform } = body;
    
    // Normalize token to string
    const tokenString = typeof token === 'string' ? token : JSON.stringify(token);

    // 1. Find or create the recipient user under this tenant
    let recipientUser = await this.prisma.recipientUser.findUnique({
      where: {
        tenantId_externalUserId: {
          tenantId,
          externalUserId: recipientId,
        },
      },
    });

    if (!recipientUser) {
      recipientUser = await this.prisma.recipientUser.create({
        data: {
          tenantId,
          externalUserId: recipientId,
          name: `Recipient ${recipientId}`,
        },
      });
    }

    // 2. Upsert the device token
    const normalizedPlatform = platform === 'IOS' ? PlatformType.IOS : (platform === 'ANDROID' ? PlatformType.ANDROID : PlatformType.WEB);

    const deviceToken = await this.prisma.deviceToken.upsert({
      where: { token: tokenString },
      create: {
        tenantId,
        recipientUserId: recipientUser.id,
        token: tokenString,
        platform: normalizedPlatform,
      },
      update: {
        recipientUserId: recipientUser.id,
        platform: normalizedPlatform,
      },
    });

    return {
      success: true,
      deviceId: deviceToken.id,
    };
  }

  @Get('vapid-key')
  @ApiOperation({ summary: 'Get the VAPID public key for Web Push subscription' })
  @ApiResponse({ status: 200, description: 'VAPID public key returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getVapidKey() {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
    };
  }
}
