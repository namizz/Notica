import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prisma = {
    $queryRaw: jest.fn(),
  };
  const deliveryQueue = {
    getJobCounts: jest.fn(),
  };
  const controller = new HealthController(
    prisma as never,
    deliveryQueue as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports process liveness', () => {
    expect(controller.liveness()).toMatchObject({ status: 'ok' });
  });

  it('reports readiness when PostgreSQL and Redis respond', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    deliveryQueue.getJobCounts.mockResolvedValue({ wait: 0 });

    await expect(controller.readiness()).resolves.toMatchObject({
      status: 'ready',
      checks: {
        database: 'up',
        redis: 'up',
      },
    });
  });

  it('returns service unavailable when a dependency is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('database unavailable'));
    deliveryQueue.getJobCounts.mockResolvedValue({ wait: 0 });

    await expect(controller.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
