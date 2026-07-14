import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailSettingsModule } from '../email-settings/email-settings.module';
import { EmailSettingsController } from '../email-settings/email-settings.controller';
import { EmailContentModule } from '../email-content/email-content.module';
import { EmailContentController } from '../email-content/email-content.controller';

@Module({
  imports: [EmailSettingsModule, EmailContentModule],
  controllers: [EmailSettingsController, EmailContentController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
