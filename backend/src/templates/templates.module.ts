import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { PrismaService } from '../prisma.service';
import { DocgenModule } from '../docgen/docgen.module';

@Module({
  imports: [DocgenModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, PrismaService],
})
export class TemplatesModule {}
