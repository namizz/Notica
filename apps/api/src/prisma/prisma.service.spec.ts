import { PrismaService } from './prisma.service';

describe('PrismaService lifecycle', () => {
  let service: PrismaService;
  let connect: jest.SpyInstance;
  let disconnect: jest.SpyInstance;

  beforeEach(() => {
    service = new PrismaService();
    connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);
  });

  it('connects on module init', async () => {
    await service.onModuleInit();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('disconnects on module destroy', async () => {
    // Nest only calls this once shutdown hooks are enabled in main.ts, which
    // is what returns pooled connections instead of dropping them.
    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
