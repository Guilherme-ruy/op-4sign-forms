import { Controller, Get, Put, Post, Delete, Body, Request } from '@nestjs/common';
import { EmailSettingsService, type UpdateEmailSettingsDto } from './email-settings.service';
import { EmailService } from '../email/email.service';
import { Roles } from '../auth/roles.decorator';

@Controller('email-settings')
@Roles('SUPER_ADMIN')
export class EmailSettingsController {
  constructor(
    private readonly settings: EmailSettingsService,
    private readonly email: EmailService,
  ) {}

  @Get()
  get() {
    return this.settings.getMasked();
  }

  @Put()
  update(@Body() body: UpdateEmailSettingsDto, @Request() req: any) {
    return this.settings.update(body, req?.user?.sub);
  }

  @Delete()
  reset(@Request() req: any) {
    return this.settings.reset(req?.user?.sub);
  }

  @Post('test')
  async test(@Body() body: { to?: string }) {
    if (!body?.to || !body.to.includes('@')) {
      return { ok: false, message: 'Informe um e-mail de destino válido.' };
    }
    const ok = await this.email.sendTestEmail({ address: body.to.trim() });
    return {
      ok,
      message: ok
        ? 'E-mail de teste enviado. Verifique a caixa de entrada.'
        : 'Falha ao enviar. Confira as configurações e tente novamente.',
    };
  }
}
