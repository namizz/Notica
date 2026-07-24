import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createApiKeyCredential } from '../auth/utils/api-key.util';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async createProject(tenantId: string, name: string) {
    const credential = createApiKeyCredential();

    const project = await this.prisma.project.create({
      data: {
        tenantId,
        name,
        apiKeyHash: credential.hash,
        apiKeyPrefix: credential.prefix,
      },
      select: {
        id: true,
        name: true,
        apiKeyPrefix: true,
        createdAt: true,
      },
    });

    return {
      ...project,
      apiKey: credential.rawKey,
    };
  }

  async getProjects(tenantId: string) {
    return this.prisma.project.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        apiKeyPrefix: true,
        createdAt: true,
      },
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
    const credential = createApiKeyCredential();

    // 3. Store only the hash and non-secret prefix.
    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        apiKeyHash: credential.hash,
        apiKeyPrefix: credential.prefix,
      },
      select: {
        id: true,
        name: true,
        apiKeyPrefix: true,
        createdAt: true,
      },
    });

    return {
      ...updatedProject,
      apiKey: credential.rawKey,
    };
  }
}
