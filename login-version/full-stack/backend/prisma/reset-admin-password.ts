import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

if (existsSync('.env')) loadEnvFile('.env');

const prisma = new PrismaClient();

async function main() {
  const username = String(process.env.ADMIN_RESET_USERNAME ?? 'admin').trim();
  const password = String(process.env.ADMIN_RESET_PASSWORD ?? '').trim();
  const saltRounds = Number(process.env.HASH_SALT_ROUNDS ?? 10);

  if (password.length < 12) {
    throw new Error('ADMIN_RESET_PASSWORD 至少需要 12 字符');
  }

  const passwordHash = await hash(password, saltRounds);
  const existingUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (!existingUser) {
    throw new Error(`Admin user not found: ${username}`);
  }

  await prisma.user.update({
    where: { username },
    data: { passwordHash, status: 'ENABLED', tenantId: null },
  });

  console.log(`Admin password reset completed for: ${username}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
