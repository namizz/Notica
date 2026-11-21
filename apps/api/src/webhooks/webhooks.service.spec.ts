import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  const prisma = {
    project: { findFirst: jest.fn() },
    webhookEndpoint: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    webhookDelivery: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const queue = {
    add: jest.fn(),
  };

  let service: WebhooksService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WEBHOOK_SIGNING_KEY = 'test-signing-key-for-webhooks-service-spec';
    service = new WebhooksService(
      prisma as unknown as PrismaService,
      queue as unknown as Queue,
    );
  });

  describe('publish', () => {
    it('fans out to endpoints subscribed to the event type', async () => {
      const endpoints = [
        { id: 'ep-1', url: 'https://client1.com/hook' },
        { id: 'ep-2', url: 'https://client2.com/hook' },
      ];
      prisma.webhookEndpoint.findMany.mockResolvedValueOnce(endpoints);
      prisma.webhookDelivery.create
        .mockResolvedValueOnce({ id: 'del-1', endpointId: 'ep-1' })
        .mockResolvedValueOnce({ id: 'del-2', endpointId: 'ep-2' });
      queue.add.mockResolvedValue({});

      await service.publish('t1', 'p1', 'notification.delivered', {
        notificationId: 'notif-1',
      });

      expect(prisma.webhookEndpoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 't1',
            projectId: 'p1',
            enabled: true,
            events: { hasSome: ['notification.delivered', '*'] },
          }),
        }),
      );
      expect(prisma.webhookDelivery.create).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledTimes(2);
    });

    it('does nothing when no endpoints match', async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValueOnce([]);

      await service.publish('t1', 'p1', 'notification.sent', {
        notificationId: 'notif-1',
      });

      expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('never throws even if database throws during publish', async () => {
      prisma.webhookEndpoint.findMany.mockRejectedValueOnce(
        new Error('Database crashed'),
      );

      await expect(
        service.publish('t1', 'p1', 'notification.failed', {
          notificationId: 'notif-1',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
