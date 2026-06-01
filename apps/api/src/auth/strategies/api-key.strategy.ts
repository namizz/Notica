import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private prisma: PrismaService) {
    super();
  }

  async validate(req: Request): Promise<any> {
    // Extract api key from header
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('API key is missing');
    }

    const project = await this.prisma.project.findUnique({
      where: { apiKey },
    });

    if (!project) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Return an object that represents the validated client
    // By convention, we'll store tenantId to use with decorators
    return { projectId: project.id, tenantId: project.tenantId };
  }
}
