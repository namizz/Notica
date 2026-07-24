import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'super-secret-dev',
    });
  }

  async validate(payload: any) {
    // Validate the user from the payload
    const user = await this.prisma.dashboardUser.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    // We also return the tenantId so it can be extracted
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: user.tenantId,
      role: user.role,
      sid: payload.sid,
    };
  }
}
