import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeDeleted = false) {
    return this.prisma.department.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async create(name: string, safeUuid: string, safeName?: string) {
    return this.prisma.department.create({
      data: { name, safeUuid, safeName },
    });
  }

  async update(id: string, name: string, safeUuid: string, safeName?: string) {
    return this.prisma.department.update({
      where: { id },
      data: { name, safeUuid, safeName, deletedAt: null }, // Reactivate if it was deleted? User didn't ask but usually update re-enables or we use reactivate
    });
  }

  async reactivate(id: string) {
    return this.prisma.department.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  async remove(id: string) {
    return this.prisma.department.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
