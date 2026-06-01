import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ApiKeyStrategy } from './strategies/api-key.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-dev',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  providers: [JwtStrategy, ApiKeyStrategy],
  exports: [JwtStrategy, ApiKeyStrategy, PassportModule],
})
export class AuthModule {}
