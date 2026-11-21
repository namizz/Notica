import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeE164 } from '../common/phone.util';
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

    let normalizedPhone: string | undefined;
    if (dto.phone) {
      normalizedPhone = normalizeE164(dto.phone) ?? undefined;
      if (!normalizedPhone) {
        throw new BadRequestException(
          'The phone number is not a valid E.164 string (e.g. +251911234567).',
        );
      }
    }

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
        phone: normalizedPhone,
      },
      create: {
        tenantId,
        projectId,
        externalUserId,
        email,
        name,
        phone: normalizedPhone,
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
