import { Controller, Get, Request, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { DashboardService } from './dashboard.service';
import { Public } from './auth/public.decorator';
import { Roles } from './auth/roles.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dashboardService: DashboardService,
  ) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Get('dashboard/stats')
  async getStats(@Request() req: any, @Query('departmentIds') departmentIds?: string | string[]) {
    const depts = typeof departmentIds === 'string' ? [departmentIds] : departmentIds;
    return this.dashboardService.getStats(req.user as any, depts);
  }

  @Roles('ADMIN')
  @Get('reports/stats')
  async getReportStats(@Request() req: any, @Query('departmentIds') departmentIds?: string | string[]) {
    const depts = typeof departmentIds === 'string' ? [departmentIds] : departmentIds;
    return this.dashboardService.getReportStats(req.user as any, depts);
  }

  @Roles('ADMIN')
  @Get('reports/export')
  async exportSubmissions(@Request() req: any, @Query('departmentIds') departmentIds?: string | string[]) {
    const depts = typeof departmentIds === 'string' ? [departmentIds] : departmentIds;
    return this.dashboardService.getReportStats(req.user as any, depts);
  }

  @Roles('ADMIN')
  @Get('reports/items')
  async getReportItems(@Request() req: any, @Query('departmentIds') departmentIds?: string | string[]) {
    const depts = typeof departmentIds === 'string' ? [departmentIds] : departmentIds;
    return this.dashboardService.getReportItems(req.user as any, depts);
  }
}
