import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Departamentos
  for (const name of ['RH', 'Financeiro', 'T.I.']) {
    await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('Departamentos criados: RH, Financeiro, T.I.');

  // Admin
  const hash = await bcrypt.hash('DEFINIR_SENHA_AQUI', 12);
  const user = await prisma.user.upsert({
    where: { email: 'admin@suaempresa.com.br' },
    update: { name: 'Administrador', password: hash, role: 'SUPER_ADMIN' },
    create: { email: 'admin@suaempresa.com.br', name: 'Administrador', password: hash, role: 'SUPER_ADMIN' },
  });
  console.log('Usuário criado:', user.email, '| role:', user.role);
}

main().finally(() => prisma.$disconnect());
