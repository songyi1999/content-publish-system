import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(plain, salt, 64).toString('hex')}`;
}

async function main(): Promise<void> {
  const admin = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', remark: '超级管理员', permissions: ['*'] },
  });
  await prisma.role.upsert({
    where: { name: 'editor' },
    update: {},
    create: { name: 'editor', remark: '内容编辑（无发布权）', permissions: ['content:edit', 'content:submit'] },
  });
  await prisma.role.upsert({
    where: { name: 'auditor' },
    update: {},
    create: { name: 'auditor', remark: '审核员', permissions: ['content:review'] },
  });
  await prisma.role.upsert({
    where: { name: 'publisher' },
    update: {},
    create: { name: 'publisher', remark: '发布管理员', permissions: ['publish:manage', 'schedule:manage'] },
  });

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash: hashPassword('admin123'), displayName: '管理员', roleId: admin.id },
  });
  console.log('seed done: admin / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
