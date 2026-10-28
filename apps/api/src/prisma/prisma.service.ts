import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Returns pooled connections on shutdown instead of letting the platform
   * drop them, which otherwise leaves sessions open until the server times
   * them out.
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
