import { PrismaService } from '../prisma/prisma.service';
import { RecipientsService } from './recipients.service';

describe('RecipientsService project isolation', () => {
  const recipientUser = {
    upsert: jest.fn(),
    findMany: jest.fn(),
  };
  const service = new RecipientsService({
    recipientUser,
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses project-scoped identity when identifying a recipient', async () => {
    recipientUser.upsert.mockResolvedValue({ id: 'recipient-1' });

    await service.identifyRecipient('tenant-1', 'project-1', {
      externalUserId: 'customer-1',
      email: 'user@example.com',
      name: 'User',
    });

    expect(recipientUser.upsert).toHaveBeenCalledWith({
      where: {
        projectId_externalUserId: {
          projectId: 'project-1',
          externalUserId: 'customer-1',
        },
      },
      update: {
        email: 'user@example.com',
        name: 'User',
      },
      create: {
        tenantId: 'tenant-1',
        projectId: 'project-1',
        externalUserId: 'customer-1',
        email: 'user@example.com',
        name: 'User',
      },
    });
  });

  it('filters recipient lists by both tenant and project', async () => {
    recipientUser.findMany.mockResolvedValue([]);

    await service.getRecipients('tenant-1', 'project-2');

    expect(recipientUser.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', projectId: 'project-2' },
      orderBy: { createdAt: 'desc' },
    });
  });
});
