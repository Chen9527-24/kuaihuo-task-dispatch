// Initialize the dedicated task DB and give the member web app only public settings.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

function readGuideImages() {
  const folder = process.env.TASK_GUIDES_DIR || '/task-guides';
  const manifest = path.join(folder, 'guide-images.json');
  if (!fs.existsSync(manifest)) return undefined;
  const invalid = () => { throw new Error('请检查 guide-images.json 的结构和公开图片地址，参见部署指南。'); };
  const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const checkUrl = value => {
    if (typeof value !== 'string' || !value || value !== value.trim()) invalid();
    if (/^\/task-guides\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(png|jpe?g|webp)$/.test(value)) return;
    let url;
    try { url = new URL(value); } catch { invalid(); }
    if (url.protocol !== 'https:' || url.username || url.password) invalid();
  };
  let guideImages;
  try { guideImages = JSON.parse(fs.readFileSync(manifest, 'utf8')); } catch { invalid(); }
  const checkMap = (obj, keys) => {
    if (!isMap(obj) || Object.keys(obj).some(key => !keys.includes(key))) invalid();
  };
  checkMap(guideImages, ['douyin', 'xiaohongshu', 'weixin']);
  for (const platform of Object.values(guideImages)) {
    checkMap(platform, ['start', 'claim']);
    for (const image of Object.values(platform)) {
      if (typeof image === 'string') checkUrl(image);
      else {
        checkMap(image, ['ios', 'android']);
        for (const url of Object.values(image)) checkUrl(url);
      }
    }
  }
  return guideImages;
}

async function main() {
  let guideImages;
  try {
    guideImages = readGuideImages();
  } catch {
    console.warn('无法读取 guide-images.json，成员页面将使用随包示意图。请检查图片配置。');
  }
  const db = new PrismaClient();
  try {
    execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], { stdio: 'inherit' });
    if ((await db.user.count()) === 0) {
      execFileSync('./node_modules/.bin/tsx', ['prisma/seed.ts'], {
        stdio: 'inherit',
        env: { ...process.env, ALLOW_PRODUCTION_SEED: 'true' },
      });
    }
    const code = process.env.H5_TENANT_CODE || 'DEMO-TENANT';
    const tenant = await db.tenant.findFirstOrThrow({
      where: { code, deletedAt: null, status: 'ACTIVE' }, select: { id: true },
    });
    const config = { tenantId: tenant.id, wechatOAuth: process.env.H5_WECHAT_OAUTH === 'true', guideImages };
    const folder = process.env.TENANT_CONFIG_DIR || '/tenant-config';
    fs.mkdirSync(folder, { recursive: true });
    const target = path.join(folder, 'runtime-config.js');
    fs.writeFileSync(target + '.tmp', 'window.__TASK_CONFIG__ = ' + JSON.stringify(config) + ';\n', { mode: 0o644 });
    fs.renameSync(target + '.tmp', target);
  } finally {
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
