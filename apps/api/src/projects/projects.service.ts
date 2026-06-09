import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  private generateApiKey(): string {
    const randomKey = crypto.randomBytes(24).toString('hex');
    return `ntc_live_${randomKey}`;
  }

  async createProject(tenantId: string, name: string) {
    const rawApiKey = this.generateApiKey();

    const project = await this.prisma.project.create({
      data: {
        tenantId,
        name,
        apiKey: rawApiKey,
      },
    });

    return project;
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

    // 3. Update the key
    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: { apiKey: rawApiKey },
    });

    return updatedProject;
  }

  async revealApiKey(tenantId: string, projectId: string, userId: string, code: string) {
    // 1. Fetch the user to check 2FA status
    const user = await this.prisma.dashboardUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled for this account');
    }

    if (!code) {
      throw new BadRequestException('Two-factor verification code is required');
    }

    const isCodeValid = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret,
    });

    if (!isCodeValid) {
      throw new UnauthorizedException('Invalid 2FA verification code');
    }

    // 2. Verify that the project exists and belongs to this tenant (Isolation check)
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        tenantId,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found or access denied');
    }

    return { apiKey: project.apiKey };
  }
}
