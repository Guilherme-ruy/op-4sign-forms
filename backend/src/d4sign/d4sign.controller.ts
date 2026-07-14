import { Controller, Get, Query, Request, ForbiddenException } from '@nestjs/common';
import { D4SignService } from './d4sign.service';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma.service';

@Controller('d4sign')
export class D4SignController {
  constructor(
    private readonly d4signService: D4SignService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles('SUPER_ADMIN')
  @Get('safes')
  async listSafes(@Query('page') page?: number) {
    return this.d4signService.listSafes(page);
  }

  @Get('balance')
  async getBalance(@Request() req: any) {
    // SUPER_ADMIN sempre vê; demais só com a flag canViewBalance (verificada no banco
    // para refletir alterações imediatamente, sem precisar de novo login).
    if (req.user?.role !== 'SUPER_ADMIN') {
      const u = await this.prisma.user.findUnique({
        where: { id: req.user?.sub },
        select: { canViewBalance: true },
      });
      if (!u?.canViewBalance) {
        throw new ForbiddenException('Sem permissão para visualizar o saldo.');
      }
    }
    return this.d4signService.getBalance();
  }

  @Get('documents')
  async listDocuments(@Query('page') page?: number) {
    return this.d4signService.listDocuments(page);
  }
}
