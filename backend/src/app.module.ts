import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { DashboardService } from './dashboard.service';
import { D4SignModule } from './d4sign/d4sign.module';
import { LinksModule } from './links/links.module';
import { TemplatesModule } from './templates/templates.module';
import { DocgenModule } from './docgen/docgen.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PreviewModule } from './preview/preview.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { DepartmentsModule } from './departments/departments.module';
import { BackupModule } from './backup/backup.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    UsersModule,
    D4SignModule,
    LinksModule,
    TemplatesModule,
    DocgenModule,
    WebhooksModule,
    PreviewModule,
    DepartmentsModule,
    BackupModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    DashboardService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
