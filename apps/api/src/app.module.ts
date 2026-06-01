import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { AuthTestController } from './auth-test.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ProjectsModule,
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute
      limit: 10,  // max 10 requests per minute
    }]),
  ],
  controllers: [AuthTestController],
  providers: [],
})
export class AppModule {}
