import { Module } from '@nestjs/common';
import { LinksService } from './links.service';
import { LinksController } from './links.controller';
import { PrismaService } from '../prisma.service';
import { D4SignModule } from '../d4sign/d4sign.module';
import { DocgenModule } from '../docgen/docgen.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [D4SignModule, DocgenModule, EmailModule],
  providers: [LinksService, PrismaService],
  controllers: [LinksController],
})
export class LinksModule {}
