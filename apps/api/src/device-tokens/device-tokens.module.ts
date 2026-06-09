import { Module } from '@nestjs/common';
import { DeviceTokensController } from './device-tokens.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DeviceTokensController],
})
export class DeviceTokensModule {}
