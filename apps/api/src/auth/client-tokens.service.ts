import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface ClientTokenPayload {
  type: 'recipient';
  tenantId: string;
  projectId: string;
  recipientId: string;
}

@Injectable()
export class ClientTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async issueToken(tenantId: string, projectId: string, recipientId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true },
    });

    if (!project) {
      throw new UnauthorizedException('Project access is invalid');
    }

    await this.prisma.recipientUser.upsert({
      where: {
        projectId_externalUserId: {
          projectId,
          externalUserId: recipientId,
        },
      },
      update: {},
      create: {
        tenantId,
        projectId,
        externalUserId: recipientId,
      },
    });

    const payload: ClientTokenPayload = {
      type: 'recipient',
      tenantId,
      projectId,
      recipientId,
    };

    const clientToken = await this.jwtService.signAsync(payload, {
      secret:
        process.env.CLIENT_TOKEN_SECRET ||
        process.env.JWT_SECRET ||
        'super-secret-dev-client',
      expiresIn: '15m',
    });

    return {
      clientToken,
      expiresIn: 900,
      recipientId,
      projectId,
    };
  }
}
