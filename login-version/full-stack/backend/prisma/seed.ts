import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { syncSystemAccessControl, syncSystemDicts } from './system-data';

if (existsSync('.env')) loadEnvFile('.env');

const prisma = new PrismaClient();
const isProduction = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
const allowProductionSeed = process.env.ALLOW_PRODUCTION_SEED === 'true';
const ADMIN_TENANT_CODE = process.env.SEED_ADMIN_TENANT_CODE ?? 'ADMIN-TENANT-DEFAULT';
const ADMIN_TENANT_NAME = process.env.SEED_ADMIN_TENANT_NAME ?? '管理员租户';
const PERMANENT_EXPIRED_AT = new Date('9999-12-31T23:59:59.999Z');

async function main() {
  ensureSeedSafety();
  const username = String(process.env.SEED_ADMIN_USERNAME ?? '').trim();
  const password = String(process.env.SEED_ADMIN_PASSWORD ?? '');
  if (!username) throw new Error('请先在 .env 填写 SEED_ADMIN_USERNAME');
  if (password.length < 12) throw new Error('请先在 .env 填写至少 12 字符的 SEED_ADMIN_PASSWORD，初始化不会使用默认口令');
  await syncSystemDicts(prisma);
  const { adminRole } = await syncSystemAccessControl(prisma);

  const tenant = await prisma.tenant.upsert({
    where: { code: 'DEMO-TENANT' },
    update: { name: '演示租户', status: 'ACTIVE' },
    create: {
      code: 'DEMO-TENANT',
      name: '演示租户',
      status: 'ACTIVE',
      industry: '短视频运营',
      productIntro: '用于本地开发和联调的默认租户',
      coreSellingPoint: '多媒体账号管理、每日任务、评论进度',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      expiredAt: PERMANENT_EXPIRED_AT,
    },
  });

  const adminTenant = await prisma.tenant.upsert({
    where: { code: ADMIN_TENANT_CODE },
    update: {
      name: ADMIN_TENANT_NAME,
      status: 'ACTIVE',
      deletedAt: null,
      expiredAt: PERMANENT_EXPIRED_AT,
    },
    create: {
      code: ADMIN_TENANT_CODE,
      name: ADMIN_TENANT_NAME,
      status: 'ACTIVE',
      industry: '系统管理',
      productIntro: '默认超级管理员工作空间，用于系统初始化、租户和任务配置。',
      coreSellingPoint: '超级管理员默认租户，保证 admin 账号在任意环境首次登录时都有可用工作空间。',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      expiredAt: PERMANENT_EXPIRED_AT,
      remark: '系统初始化自动创建，请勿删除；如需替换，请先为 admin 账号绑定其他可用租户。',
    },
  });

  const demoMediaAccount = await prisma.mediaAccount.findFirst({
    where: {
      tenantId: tenant.id,
      platform: 'DOUYIN',
      accountId: 'demo_douyin_001',
      deletedAt: null,
    },
    select: { id: true },
  });

  if (demoMediaAccount) {
    await prisma.mediaAccount.update({
      where: { id: demoMediaAccount.id },
      data: { accountName: '演示作品账号', status: 'ENABLED' },
    });
  } else {
    await prisma.mediaAccount.create({
      data: {
        tenantId: tenant.id,
        platform: 'DOUYIN',
        accountId: 'demo_douyin_001',
        accountName: '演示作品账号',
        status: 'ENABLED',
        positioning: '演示抖音账号，用于每日任务联调',
      },
    });
  }

  const existingUser = await prisma.user.findUnique({ where: { username } });
  const user = existingUser ?? await prisma.user.create({
    data: {
      username,
      passwordHash: await hash(password, Number(process.env.HASH_SALT_ROUNDS ?? 10)),
      displayName: '任务管理员',
      status: 'ENABLED',
      tenantId: tenant.id,
    },
  });

  // 首次登录即进入 H5 所属的业务租户。重复初始化保留管理员已选择的默认租户和成员状态。
  for (const tenantId of new Set([tenant.id, adminTenant.id])) {
    await prisma.userTenantMembership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId } },
      update: {},
      create: { userId: user.id, tenantId, status: 'ENABLED', isDefault: tenantId === user.tenantId },
    });
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });

  if (existingUser) {
    console.log(`Seeded admin user: ${username} (password unchanged)`);
  } else {
    console.log(`Seeded admin user: ${username}`);
  }
}

function ensureSeedSafety() {
  if (!isProduction) return;
  if (allowProductionSeed) return;
  throw new Error(
    [
      'Refusing to run prisma seed in production.',
      'If you really need this, set ALLOW_PRODUCTION_SEED=true for this command only.',
      'Existing admin passwords are no longer overwritten by seed.',
      'Use the dedicated admin reset script when you need to rotate the admin password.',
    ].join(' '),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
