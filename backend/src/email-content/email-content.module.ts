import { Module } from '@nestjs/common';
import { EmailContentService } from './email-content.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [EmailContentService, PrismaService],
  exports: [EmailContentService],
})
export class EmailContentModule {}
