import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientTokenPayload } from '../client-tokens.service';

export type ClientTokenPrincipal = ClientTokenPayload;

@Injectable()
export class ClientTokenStrategy extends PassportStrategy(
  Strategy,
  'client-token',
) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.CLIENT_TOKEN_SECRET ||
        process.env.JWT_SECRET ||
        'super-secret-dev-client',
    });
  }

  async validate(payload: ClientTokenPayload): Promise<ClientTokenPrincipal> {
    if (
      payload.type !== 'recipient' ||
      !payload.tenantId ||
      !payload.projectId ||
      !payload.recipientId
    ) {
      throw new UnauthorizedException('Invalid client token');
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: payload.projectId,
        tenantId: payload.tenantId,
      },
      select: { id: true },
    });

    if (!project) {
      throw new UnauthorizedException('Client token project is invalid');
    }

    return payload;
  }
}
