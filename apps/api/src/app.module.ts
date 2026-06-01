import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuthTestController } from './auth-test.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AuthTestController],
  providers: [],
})
export class AppModule {}
