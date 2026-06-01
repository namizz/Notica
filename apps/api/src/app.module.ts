import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { AuthTestController } from './auth-test.controller';

@Module({
  imports: [PrismaModule, AuthModule, ProjectsModule],
  controllers: [AuthTestController],
  providers: [],
})
export class AppModule {}
