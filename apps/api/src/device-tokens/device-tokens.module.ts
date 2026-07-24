import { Module } from '@nestjs/common';
import { DeviceTokensController } from './device-tokens.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DeviceTokensController],
})
export class DeviceTokensModule {}
