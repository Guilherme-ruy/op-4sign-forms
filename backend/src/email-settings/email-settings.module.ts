import { Module } from '@nestjs/common';
import { EmailSettingsService } from './email-settings.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [EmailSettingsService, PrismaService],
  exports: [EmailSettingsService],
})
export class EmailSettingsModule {}
