import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChannelType } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelRegistry } from './channel-registry';

interface ScopedRequest extends Request {
  user: { tenantId: string; projectId?: string };
}

export interface ChannelStatus {
  channel: ChannelType;
  enabled: boolean;
  ready: boolean;
  provider: string | null;
  detail?: string;
}

@ApiTags('Channels')
@UseGuards(ThrottlerGuard, AuthGuard(['jwt', 'api-key']))
@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly registry: ChannelRegistry,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List delivery channels and whether each one can send for this project',
  })
  @ApiHeader({ name: 'x-api-key', required: false })
  async list(
    @Req() request: ScopedRequest,
    @Query('projectId') requestedProjectId?: string,
  ): Promise<ChannelStatus[]> {
    const tenantId = request.user.tenantId;
    const projectId = request.user.projectId ?? requestedProjectId;
    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true },
    });
    if (!project) {
      throw new BadRequestException('Project access is invalid');
    }

    const statuses: ChannelStatus[] = [];
    for (const channel of Object.values(ChannelType)) {
      if (this.registry.isBuiltIn(channel)) {
        statuses.push({
          channel,
          enabled: true,
          ready: true,
          provider: channel === ChannelType.IN_APP ? 'socket.io' : 'web-push',
        });
        continue;
      }

      const handler = this.registry.get(channel);
      if (!handler || !handler.isEnabled()) {
        statuses.push({
          channel,
          enabled: false,
          ready: false,
          provider: null,
          detail: 'Not configured on this server',
        });
        continue;
      }

      const readiness = handler.readiness
        ? await handler.readiness(tenantId, projectId)
        : { ready: true };
      statuses.push({
        channel,
        enabled: true,
        provider: handler.providerName(),
        ...readiness,
      });
    }
    return statuses;
  }
}
