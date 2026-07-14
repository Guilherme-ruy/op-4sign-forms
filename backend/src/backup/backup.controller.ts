import { Controller, Post, HttpCode } from '@nestjs/common';
import { BackupService } from './backup.service';
import { Roles } from '../auth/roles.decorator';

@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post('run')
  @Roles('SUPER_ADMIN')
  @HttpCode(200)
  async triggerBackup() {
    const filename = await this.backupService.runBackup();
    return { message: 'Backup concluído com sucesso.', filename };
  }
}
