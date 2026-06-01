import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentTenant } from './auth/decorators/current-tenant.decorator';

@Controller('auth-test')
export class AuthTestController {
  
  // This endpoint requires a valid JWT Token (Dashboard User)
  @UseGuards(AuthGuard('jwt'))
  @Get('dashboard-user')
  testJwtAuth(@CurrentTenant() tenantId: string) {
    return {
      message: 'JWT Authentication successful!',
      tenantId,
    };
  }

  // This endpoint requires a valid API Key (Client Application)
  @UseGuards(AuthGuard('api-key'))
  @Get('api-key')
  testApiKeyAuth(@CurrentTenant() tenantId: string) {
    return {
      message: 'API Key Authentication successful!',
      tenantId,
    };
  }
}
