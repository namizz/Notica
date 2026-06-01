import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  private generateApiKey(): string {
    const randomKey = crypto.randomBytes(24).toString('hex');
    return `ntc_live_${randomKey}`;
  }

  async createProject(tenantId: string, name: string) {
    const apiKey = this.generateApiKey();

    return this.prisma.project.create({
      data: {
        tenantId,
        name,
        apiKey,
      },
    });
  }

  async getProjects(tenantId: string) {
    return this.prisma.project.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async rotateApiKey(tenantId: string, projectId: string) {
    // 1. Verify that the project exists and belongs to this tenant (Isolation check)
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        tenantId,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found or access denied');
    }

    // 2. Generate a new API key
    const newApiKey = this.generateApiKey();

    // 3. Update the key
    return this.prisma.project.update({
      where: { id: projectId },
      data: { apiKey: newApiKey },
    });
  }
}
