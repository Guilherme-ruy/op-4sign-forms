import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('DEFINIR_SENHA_AQUI', 12);

  // 1. Criar departamentos iniciais
  const depts = ['RH', 'Financeiro', 'T.I.'];
  for (const name of depts) {
    await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const tiDept = await prisma.department.findUnique({ where: { name: 'T.I.' } });

  // 2. Criar/Atualizar Super Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@suaempresa.com.br' },
    update: {
      name: 'Administrador',
      password: passwordHash,
      role: 'SUPER_ADMIN',
    },
    create: {
      email: 'admin@suaempresa.com.br',
      name: 'Administrador',
      password: passwordHash,
      role: 'SUPER_ADMIN',
    },
  });

  // 3. Vincular Super Admin ao departamento de T.I.
  if (tiDept) {
    await prisma.userDepartment.upsert({
      where: {
        userId_departmentId: {
          userId: admin.id,
          departmentId: tiDept.id,
        },
      },
      update: {},
      create: {
        userId: admin.id,
        departmentId: tiDept.id,
      },
    });
  }

  console.log('✔ Super Admin criado:', admin.email, '| role:', admin.role);
  console.log('✔ Departamentos criados:', depts.join(', '));
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
