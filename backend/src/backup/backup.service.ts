import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma.service';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  private readonly retentionDays = 7;

  constructor(private readonly prisma: PrismaService) {
    this.backupDir = process.env.BACKUP_DIR ?? path.resolve(__dirname, '../../backups');
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  // Todo dia às 02:00 horário de Brasília
  @Cron('0 2 * * *', { timeZone: 'America/Sao_Paulo' })
  async runScheduledBackup() {
    this.logger.log('Iniciando backup agendado do SQLite...');
    await this.runBackup();
  }

  async runBackup(): Promise<string> {
    const filename = `backup_${this.timestamp()}.db`;
    const destPath = path.join(this.backupDir, filename);

    await this.createSnapshot(destPath);
    this.logger.log(`Backup criado: ${filename}`);

    this.purgeOldBackups();
    return filename;
  }

  // VACUUM INTO cria snapshot consistente mesmo com WAL ativo, sem travar leituras
  private async createSnapshot(destPath: string) {
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    const safeDestPath = destPath.replace(/\\/g, '/');
    await this.prisma.$executeRawUnsafe(`VACUUM INTO '${safeDestPath}';`);
  }

  private purgeOldBackups() {
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(this.backupDir).filter((f) => f.startsWith('backup_') && f.endsWith('.db'));
    for (const file of files) {
      const fullPath = path.join(this.backupDir, file);
      const { mtimeMs } = fs.statSync(fullPath);
      if (mtimeMs < cutoff) {
        fs.unlinkSync(fullPath);
        this.logger.log(`Backup antigo removido: ${file}`);
      }
    }
  }

  private timestamp(): string {
    return new Date()
      .toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false })
      .replace(' ', '-')
      .replace(/:/g, '-');
  }
}
