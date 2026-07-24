import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';

describe('ProjectsService API-key handling', () => {
  const projectRepository = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };

  const service = new ProjectsService({
    project: projectRepository,
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores only a hash and prefix when creating a project', async () => {
    projectRepository.create.mockResolvedValue({
      id: 'project-1',
      name: 'Production',
      apiKeyPrefix: 'ntc_live_12345678',
      createdAt: new Date(),
    });

    const result = await service.createProject('tenant-1', 'Production');
    const createCall = projectRepository.create.mock.calls[0][0];

    expect(createCall.data.apiKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createCall.data.apiKeyPrefix).toMatch(/^ntc_live_[a-f0-9]{8}$/);
    expect(createCall.data).not.toHaveProperty('apiKey');
    expect(result.apiKey).toMatch(/^ntc_live_[a-f0-9]{48}$/);
  });

  it('never selects a key hash or raw key when listing projects', async () => {
    projectRepository.findMany.mockResolvedValue([]);

    await service.getProjects('tenant-1');

    expect(projectRepository.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      select: {
        id: true,
        name: true,
        apiKeyPrefix: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns a replacement key once while storing only its hash', async () => {
    projectRepository.findFirst.mockResolvedValue({
      id: 'project-1',
      tenantId: 'tenant-1',
    });
    projectRepository.update.mockResolvedValue({
      id: 'project-1',
      name: 'Production',
      apiKeyPrefix: 'ntc_live_12345678',
      createdAt: new Date(),
    });

    const result = await service.rotateApiKey('tenant-1', 'project-1');
    const updateCall = projectRepository.update.mock.calls[0][0];

    expect(updateCall.data.apiKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(updateCall.data).not.toHaveProperty('apiKey');
    expect(result.apiKey).toMatch(/^ntc_live_[a-f0-9]{48}$/);
  });
});
