import { Controller, Get, Post, Patch, Delete, Param, Body, Put, ForbiddenException, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
@Roles('SUPER_ADMIN')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  // Rotas estáticas ANTES das dinâmicas (:id) para evitar conflito de roteamento
  @Get('invites')
  listInvites() {
    return this.usersService.listPendingInvites();
  }

  @Post('invite')
  invite(@Body() body: { email: string; name?: string; role?: string; departmentIds?: string[] }) {
    return this.usersService.invite(body);
  }

  @Post('invites/:id/resend')
  resendInvite(@Param('id') id: string) {
    return this.usersService.resendInvite(id);
  }

  @Delete('invites/:id')
  cancelInvite(@Param('id') id: string) {
    return this.usersService.cancelInvite(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.usersService.update(id, body);
  }

  @Post(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.usersService.reactivate(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Get(':id/templates')
  getTemplateAccess(@Param('id') id: string) {
    return this.usersService.getTemplateAccess(id);
  }

  @Put(':id/templates')
  setTemplateAccess(@Param('id') id: string, @Body('templateIds') templateIds: string[]) {
    return this.usersService.setTemplateAccess(id, templateIds ?? []);
  }
}
