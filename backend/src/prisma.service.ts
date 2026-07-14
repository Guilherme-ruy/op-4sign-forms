import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    // WAL mode: reduz lock contention em escritas simultâneas
    // journal_mode retorna valor → queryRaw; synchronous não retorna → executeRaw
    await this.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await this.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
    this.logger.log('SQLite WAL mode habilitado');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
