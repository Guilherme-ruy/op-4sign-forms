import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailSettingsModule } from '../email-settings/email-settings.module';
import { EmailSettingsController } from '../email-settings/email-settings.controller';

@Module({
  imports: [EmailSettingsModule],
  controllers: [EmailSettingsController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
