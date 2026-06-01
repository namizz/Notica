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

  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  async createProject(tenantId: string, name: string) {
    const rawApiKey = this.generateApiKey();
    const hashedApiKey = this.hashApiKey(rawApiKey);

    const project = await this.prisma.project.create({
      data: {
        tenantId,
        name,
        apiKey: hashedApiKey,
      },
    });

    return {
      ...project,
      apiKey: rawApiKey,
    };
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
    const rawApiKey = this.generateApiKey();
    const hashedApiKey = this.hashApiKey(rawApiKey);

    // 3. Update the key
    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: { apiKey: hashedApiKey },
    });

    return {
      ...updatedProject,
      apiKey: rawApiKey,
    };
  }
}
