import { Controller, Get, Post, Patch, Body, Delete, Param, Query, BadRequestException } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { Roles } from '../auth/roles.decorator';

interface DepartmentBody {
  name?: string;
  safeUuid?: string;
  safeName?: string;
}

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  findAll(@Query('includeDeleted') includeDeleted?: string) {
    return this.departmentsService.findAll(includeDeleted === 'true');
  }

  @Roles('SUPER_ADMIN')
  @Post()
  create(@Body() body: DepartmentBody) {
    const { name, safeUuid, safeName } = this.validate(body);
    return this.departmentsService.create(name, safeUuid, safeName);
  }

  @Roles('SUPER_ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: DepartmentBody) {
    const { name, safeUuid, safeName } = this.validate(body);
    return this.departmentsService.update(id, name, safeUuid, safeName);
  }

  private validate(body: DepartmentBody) {
    const name = body.name?.trim();
    const safeUuid = body.safeUuid?.trim();
    if (!name) throw new BadRequestException('Nome do departamento é obrigatório');
    if (!safeUuid) throw new BadRequestException('Cofre D4Sign é obrigatório');
    return { name, safeUuid, safeName: body.safeName?.trim() || undefined };
  }

  @Roles('SUPER_ADMIN')
  @Post(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.departmentsService.reactivate(id);
  }

  @Roles('SUPER_ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.departmentsService.remove(id);
  }
}
