import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdentifyRecipientDto } from './dto/identify-recipient.dto';

@Injectable()
export class RecipientsService {
  constructor(private prisma: PrismaService) {}

  async identifyRecipient(
    tenantId: string,
    projectId: string,
    dto: IdentifyRecipientDto,
  ) {
    const { externalUserId, email, name } = dto;

    return this.prisma.recipientUser.upsert({
      where: {
        projectId_externalUserId: {
          projectId,
          externalUserId,
        },
      },
      update: {
        email,
        name,
      },
      create: {
        tenantId,
        projectId,
        externalUserId,
        email,
        name,
      },
    });
  }

  async getRecipients(tenantId: string, projectId: string) {
    return this.prisma.recipientUser.findMany({
      where: { tenantId, projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRecipientByExternalId(
    tenantId: string,
    projectId: string,
    externalUserId: string,
  ) {
    const recipient = await this.prisma.recipientUser.findUnique({
      where: {
        projectId_externalUserId: {
          projectId,
          externalUserId,
        },
      },
    });

    if (!recipient) {
      throw new NotFoundException(
        `Recipient with external ID ${externalUserId} not found`,
      );
    }

    if (recipient.tenantId !== tenantId) {
      throw new NotFoundException(
        `Recipient with external ID ${externalUserId} not found`,
      );
    }

    return recipient;
  }
}
