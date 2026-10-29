/**
 * 轻量迁移执行器：按序执行 prisma/migrations 下各目录的 migration.sql 并登记 _prisma_migrations。
 * 用于 Alpine(musl) 镜像——该环境下 Prisma schema engine 二进制不可用，
 * 用 @prisma/client 的连接执行原始 SQL 即可（本工程迁移均为简单 DDL，按分号拆分安全）。
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations');

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "_prisma_migrations" (id VARCHAR(36) PRIMARY KEY, checksum VARCHAR(64) NOT NULL, finished_at TIMESTAMPTZ NOT NULL DEFAULT now(), migration_name VARCHAR(255) NOT NULL, logs TEXT, applied_steps_count INT NOT NULL DEFAULT 0, rolled_back_at TIMESTAMPTZ, started_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const applied = new Set(
      (await prisma.$queryRawUnsafe(`SELECT migration_name FROM "_prisma_migrations"`))
        .map((r) => r.migration_name),
    );
    const dirs = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const dir of dirs) {
      if (applied.has(dir)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf-8');
      const statements = sql
        .split(';')
        .map((s) => s.replace(/--.*$/gm, '').trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await prisma.$executeRawUnsafe(stmt);
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (id, checksum, migration_name) VALUES ('${crypto.randomUUID()}', '${dir}', '${dir}')`,
      );
      console.log(`[migrate] applied: ${dir} (${statements.length} statements)`);
    }
    console.log('[migrate] up to date');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[migrate] failed:', e.message);
  process.exit(1);
});
