import { registerAs } from '@nestjs/config';

function toBoolean(value: string | undefined, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['true', '1', 'yes', 'on', 'enabled'].includes(value.trim().toLowerCase());
}

function toStringList(value: string | undefined, fallback: string[]) {
  const items = String(value ?? '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return items.length ? Array.from(new Set(items)) : fallback;
}

export const storageConfig = registerAs('storage', () => ({
  driver: process.env.UPLOAD_DRIVER ?? 'local',
  maxFileSizeMb: Number(process.env.UPLOAD_MAX_FILE_SIZE_MB ?? 20),
  localUploadDir: process.env.LOCAL_UPLOAD_DIR ?? 'uploads',
  oss: {
    region: process.env.OSS_REGION ?? '',
    bucket: process.env.OSS_BUCKET ?? '',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID ?? '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET ?? '',
    endpoint: process.env.OSS_ENDPOINT ?? '',
    cdnBaseUrl: process.env.OSS_CDN_BASE_URL ?? '',
    objectPrefix: process.env.OSS_OBJECT_PREFIX ?? 'uploads',
  },
  tencentCos: {
    // Tencent COS is intentionally opt-in so existing local/OSS uploads are never switched just because credentials exist.
    enabled: toBoolean(process.env.TENCENT_COS_ENABLED, false),
    region: process.env.TENCENT_COS_REGION ?? '',
    bucket: process.env.TENCENT_COS_BUCKET ?? '',
    secretId: process.env.TENCENT_COS_SECRET_ID ?? '',
    secretKey: process.env.TENCENT_COS_SECRET_KEY ?? '',
    objectPrefix: process.env.TENCENT_COS_PREFIX ?? 'media',
    scheme: process.env.TENCENT_COS_SCHEME ?? 'https',
    signedUrlTtlSeconds: Number(process.env.TENCENT_COS_SIGNED_URL_TTL_SECONDS ?? 600),
    thumbnailUrlTtlSeconds: Number(process.env.TENCENT_COS_THUMBNAIL_URL_TTL_SECONDS ?? 3600),
    privateScenes: toStringList(process.env.TENCENT_COS_PRIVATE_SCENES, ['TASK_CLAIM_PROOF', 'TASK_SETTLEMENT_PROOF']),
    thumbnailMaxLongEdge: Number(process.env.TENCENT_COS_THUMBNAIL_MAX_LONG_EDGE ?? 320),
    thumbnailQuality: Number(process.env.TENCENT_COS_THUMBNAIL_QUALITY ?? 80),
  },
}));
