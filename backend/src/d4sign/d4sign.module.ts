import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { D4SignService } from './d4sign.service';
import { D4SignController } from './d4sign.controller';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [HttpModule],
  providers: [D4SignService, PrismaService],
  controllers: [D4SignController],
  exports: [D4SignService],
})
export class D4SignModule {}
