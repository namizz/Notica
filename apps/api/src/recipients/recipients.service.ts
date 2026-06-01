import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdentifyRecipientDto } from './dto/identify-recipient.dto';

@Injectable()
export class RecipientsService {
  constructor(private prisma: PrismaService) {}

  async identifyRecipient(tenantId: string, dto: IdentifyRecipientDto) {
    const { externalUserId, email, name } = dto;

    return this.prisma.recipientUser.upsert({
      where: {
        tenantId_externalUserId: {
          tenantId,
          externalUserId,
        },
      },
      update: {
        email,
        name,
      },
      create: {
        tenantId,
        externalUserId,
        email,
        name,
      },
    });
  }

  async getRecipients(tenantId: string) {
    return this.prisma.recipientUser.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRecipientByExternalId(tenantId: string, externalUserId: string) {
    const recipient = await this.prisma.recipientUser.findUnique({
      where: {
        tenantId_externalUserId: {
          tenantId,
          externalUserId,
        },
      },
    });

    if (!recipient) {
      throw new NotFoundException(`Recipient with external ID ${externalUserId} not found`);
    }

    return recipient;
  }
}
