import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GitHubStrategy } from './strategies/github.strategy';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientTokenStrategy } from './strategies/client-token.strategy';
import { ClientTokensService } from './client-tokens.service';
import { ClientTokensController } from './client-tokens.controller';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-dev',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController, ClientTokensController],
  providers: [
    AuthService,
    ClientTokensService,
    JwtStrategy,
    ApiKeyStrategy,
    ClientTokenStrategy,
    GoogleStrategy,
    GitHubStrategy,
  ],
  exports: [
    AuthService,
    ClientTokensService,
    JwtStrategy,
    ApiKeyStrategy,
    ClientTokenStrategy,
    PassportModule,
  ],
})
export class AuthModule {}
