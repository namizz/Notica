import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ClientTokensService } from './client-tokens.service';

describe('ClientTokensService', () => {
  const project = { findFirst: jest.fn() };
  const recipientUser = { upsert: jest.fn() };
  const jwtService = { signAsync: jest.fn() };
  const service = new ClientTokensService(
    { project, recipientUser } as unknown as PrismaService,
    jwtService as unknown as JwtService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('issues a short-lived token scoped to one project and recipient', async () => {
    project.findFirst.mockResolvedValue({ id: 'project-1' });
    recipientUser.upsert.mockResolvedValue({ id: 'recipient-1' });
    jwtService.signAsync.mockResolvedValue('signed-client-token');

    const result = await service.issueToken(
      'tenant-1',
      'project-1',
      'customer-1',
    );

    expect(project.findFirst).toHaveBeenCalledWith({
      where: { id: 'project-1', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(recipientUser.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_externalUserId: {
            projectId: 'project-1',
            externalUserId: 'customer-1',
          },
        },
      }),
    );
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      {
        type: 'recipient',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        recipientId: 'customer-1',
      },
      expect.objectContaining({ expiresIn: '15m' }),
    );
    expect(result).toEqual({
      clientToken: 'signed-client-token',
      expiresIn: 900,
      recipientId: 'customer-1',
      projectId: 'project-1',
    });
  });

  it('rejects a project outside the authenticated tenant', async () => {
    project.findFirst.mockResolvedValue(null);

    await expect(
      service.issueToken('tenant-1', 'project-2', 'customer-1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(recipientUser.upsert).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
