import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import COS from 'cos-nodejs-sdk-v5';
import sharp, { type Metadata, type OutputInfo } from 'sharp';
import type { FileStorageProvider, PresignedUpload, PresignedUploadInput, StoredFile } from './storage.provider';

type TencentCosConfig = {
  region: string;
  bucket: string;
  secretId: string;
  secretKey: string;
  objectPrefix: string;
  scheme: 'https' | 'http';
  signedUrlTtlSeconds: number;
  thumbnailUrlTtlSeconds: number;
  privateScenes: string[];
  thumbnailMaxLongEdge: number;
  thumbnailQuality: number;
};

export type FileAccessVariant = 'original' | 'thumbnail';

export type FileAccessUrl = {
  url: string;
  expiresAt: string;
  variant: FileAccessVariant;
  fallbackToOriginal: boolean;
};

@Injectable()
export class TencentCosStorageProvider implements FileStorageProvider {
  private readonly logger = new Logger(TencentCosStorageProvider.name);

  constructor(private readonly configService: ConfigService) {}

  getDriver() {
    return 'tencent_cos' as const;
  }

  isEnabledForScene(scene?: string | null) {
    const enabled = this.configService.get<boolean>('storage.tencentCos.enabled', false);
    if (!enabled) return false;
    const normalizedScene = String(scene ?? '').trim().toUpperCase();
    if (!normalizedScene) return false;
    const scenes = this.configService.get<string[]>('storage.tencentCos.privateScenes', []);
    return scenes.includes(normalizedScene);
  }

  async save(file: Express.Multer.File): Promise<StoredFile> {
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Tencent COS private storage only accepts image files');
    }

    const config = this.getRequiredConfig();
    const assetId = randomUUID();
    const originalKey = this.buildObjectKey(config.objectPrefix, 'originals', assetId, this.resolveExtension(file.mimetype));
    const thumbnailKey = this.buildObjectKey(config.objectPrefix, 'thumbnails', assetId, 'webp');

    let thumbnail: { data: Buffer; info: OutputInfo };
    let metadata: Metadata;
    try {
      const image = sharp(file.buffer, { limitInputPixels: 268_402_689, failOn: 'warning' });
      metadata = await image.metadata();
      thumbnail = await image
        .rotate()
        .resize({
          width: config.thumbnailMaxLongEdge,
          height: config.thumbnailMaxLongEdge,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: config.thumbnailQuality })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new BadRequestException('图片内容无法处理，请上传有效的 JPEG、PNG 或 WebP 图片');
    }

    const client = this.createClient(config);
    try {
      await client.putObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: originalKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      });
    } catch {
      throw new InternalServerErrorException('腾讯 COS 原图上传失败，请稍后重试');
    }

    try {
      await client.putObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: thumbnailKey,
        Body: thumbnail.data,
        ContentType: 'image/webp',
        ContentLength: thumbnail.info.size,
      });
    } catch {
      await this.deleteObjectQuietly(client, config, originalKey);
      throw new InternalServerErrorException('腾讯 COS 缩略图上传失败，请稍后重试');
    }

    const { width, height } = this.resolveOrientedDimensions(metadata);
    return {
      driver: 'tencent_cos',
      bucket: config.bucket,
      objectKey: originalKey,
      // This is a stable internal reference, never a browser-accessible permanent URL.
      url: this.buildObjectReference(config.bucket, originalKey),
      thumbnailObjectKey: thumbnailKey,
      thumbnailMimeType: 'image/webp',
      thumbnailSize: thumbnail.info.size,
      imageWidth: width,
      imageHeight: height,
    };
  }

  async createPresignedUpload(_input: PresignedUploadInput): Promise<PresignedUpload> {
    throw new BadRequestException('Private Tencent COS files must be uploaded through the server upload endpoint');
  }

  buildObjectUrl(objectKey: string) {
    const config = this.getRequiredConfig();
    this.assertManagedObjectKey(objectKey, config.objectPrefix);
    return this.buildObjectReference(config.bucket, objectKey);
  }

  async assertObjectExists(objectKey: string, expectedBucket?: string | null) {
    const config = this.getRequiredConfig();
    if (expectedBucket && expectedBucket !== config.bucket) {
      // 环境或配置错误不能被当成“用户图片已删除”，否则 H5 会误清缓存。
      throw new InternalServerErrorException('腾讯 COS 文件桶与当前环境配置不一致');
    }
    this.assertManagedObjectKey(objectKey, config.objectPrefix);
    try {
      await this.createClient(config).headObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: objectKey,
      });
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || error?.status || 0);
      const code = String(error?.code || '').trim();
      if (code === 'NoSuchKey' || code === 'NoSuchObject' || (statusCode === 404 && code !== 'NoSuchBucket')) {
        throw new NotFoundException('腾讯 COS 中未找到已上传文件');
      }
      // 网络、鉴权、桶配置等异常必须保留为服务端异常，H5 只提示稍后重试，不会误清缓存。
      throw new InternalServerErrorException('腾讯 COS 文件存在性校验失败，请稍后重试');
    }
  }

  async cleanupStoredFile(params: {
    bucket: string | null;
    objectKey: string;
    thumbnailObjectKey?: string | null;
  }) {
    const config = this.getRequiredConfig();
    if (params.bucket && params.bucket !== config.bucket) {
      this.logger.warn('跳过腾讯 COS 清理：文件桶与当前环境桶不一致');
      return;
    }

    const objectKeys = Array.from(new Set([params.thumbnailObjectKey, params.objectKey].filter(Boolean))) as string[];
    const client = this.createClient(config);
    for (const objectKey of objectKeys) {
      try {
        this.assertManagedObjectKey(objectKey, config.objectPrefix);
        await client.deleteObject({ Bucket: config.bucket, Region: config.region, Key: objectKey });
      } catch {
        this.logger.warn(`腾讯 COS 存储回滚清理失败，objectKey=${objectKey}`);
      }
    }
  }

  createSignedReadUrl(params: {
    bucket: string | null;
    objectKey: string;
    thumbnailObjectKey?: string | null;
    variant?: FileAccessVariant;
  }): FileAccessUrl {
    const config = this.getRequiredConfig();
    if (params.bucket && params.bucket !== config.bucket) {
      throw new NotFoundException('文件不属于当前环境存储桶');
    }

    const requestedVariant = params.variant ?? 'original';
    const useThumbnail = requestedVariant === 'thumbnail' && Boolean(params.thumbnailObjectKey);
    const objectKey = useThumbnail ? String(params.thumbnailObjectKey) : params.objectKey;
    this.assertManagedObjectKey(objectKey, config.objectPrefix);
    const expiresIn = useThumbnail ? config.thumbnailUrlTtlSeconds : config.signedUrlTtlSeconds;

    try {
      const url = this.createClient(config).getObjectUrl({
        Bucket: config.bucket,
        Region: config.region,
        Key: objectKey,
        Sign: true,
        Method: 'GET',
        Expires: expiresIn,
        Protocol: config.scheme,
      });
      return {
        url,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        variant: useThumbnail ? 'thumbnail' : 'original',
        fallbackToOriginal: requestedVariant === 'thumbnail' && !useThumbnail,
      };
    } catch {
      throw new InternalServerErrorException('腾讯 COS 访问链接生成失败，请稍后重试');
    }
  }

  /** 仅供后端受控服务（如 OCR）读取私有对象，不生成或泄露客户端地址。 */
  async getObjectBuffer(objectKey: string, expectedBucket?: string | null) {
    const config = this.getRequiredConfig();
    if (expectedBucket && expectedBucket !== config.bucket) {
      throw new InternalServerErrorException('腾讯 COS 文件桶与当前环境配置不一致');
    }
    this.assertManagedObjectKey(objectKey, config.objectPrefix);
    try {
      const result: any = await this.createClient(config).getObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: objectKey,
      });
      const body = result?.Body;
      if (Buffer.isBuffer(body)) return body;
      if (typeof body === 'string') return Buffer.from(body);
      if (body && typeof body.pipe === 'function') {
        const chunks: Buffer[] = [];
        for await (const chunk of body as AsyncIterable<Buffer | string>) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      }
      throw new Error('COS response has no buffer body');
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || error?.status || 0);
      const code = String(error?.code || '').trim();
      if (code === 'NoSuchKey' || code === 'NoSuchObject' || (statusCode === 404 && code !== 'NoSuchBucket')) {
        throw new NotFoundException('腾讯 COS 中未找到已上传文件');
      }
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('腾讯 COS 文件读取失败，请稍后重试');
    }
  }

  private getRequiredConfig(): TencentCosConfig {
    const region = this.configService.get<string>('storage.tencentCos.region', '').trim();
    const bucket = this.configService.get<string>('storage.tencentCos.bucket', '').trim();
    const secretId = this.configService.get<string>('storage.tencentCos.secretId', '').trim();
    const secretKey = this.configService.get<string>('storage.tencentCos.secretKey', '').trim();
    const objectPrefix = this.normalizePrefix(this.configService.get<string>('storage.tencentCos.objectPrefix', 'media'));
    const rawScheme = this.configService.get<string>('storage.tencentCos.scheme', 'https').trim().toLowerCase();
    const scheme = rawScheme === 'http' ? 'http' : 'https';
    const signedUrlTtlSeconds = this.configService.get<number>('storage.tencentCos.signedUrlTtlSeconds', 600);
    const thumbnailUrlTtlSeconds = this.configService.get<number>('storage.tencentCos.thumbnailUrlTtlSeconds', 3600);
    const privateScenes = this.configService.get<string[]>('storage.tencentCos.privateScenes', []);
    const thumbnailMaxLongEdge = this.configService.get<number>('storage.tencentCos.thumbnailMaxLongEdge', 320);
    const thumbnailQuality = this.configService.get<number>('storage.tencentCos.thumbnailQuality', 80);

    const missing = [
      ['TENCENT_COS_REGION', region],
      ['TENCENT_COS_BUCKET', bucket],
      ['TENCENT_COS_SECRET_ID', secretId],
      ['TENCENT_COS_SECRET_KEY', secretKey],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missing.length > 0) {
      throw new InternalServerErrorException(`腾讯 COS 配置缺失: ${missing.join(', ')}`);
    }

    return {
      region,
      bucket,
      secretId,
      secretKey,
      objectPrefix,
      scheme,
      signedUrlTtlSeconds,
      thumbnailUrlTtlSeconds,
      privateScenes,
      thumbnailMaxLongEdge,
      thumbnailQuality,
    };
  }

  private createClient(config: TencentCosConfig) {
    return new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
      Protocol: config.scheme,
    });
  }

  private async deleteObjectQuietly(client: COS, config: TencentCosConfig, objectKey: string) {
    try {
      await client.deleteObject({ Bucket: config.bucket, Region: config.region, Key: objectKey });
    } catch {
      this.logger.warn(`腾讯 COS 缩略图上传失败后的原图清理未完成，objectKey=${objectKey}`);
    }
  }

  private buildObjectKey(prefix: string, category: 'originals' | 'thumbnails', assetId: string, extension: string) {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    return `${prefix}/${category}/${year}/${month}/${day}/${assetId}.${extension}`;
  }

  private buildObjectReference(bucket: string, objectKey: string) {
    return `tencent-cos://${bucket}/${objectKey}`;
  }

  private normalizePrefix(value: string) {
    return String(value ?? 'media')
      .trim()
      .replace(/^\/+|\/+$/g, '') || 'media';
  }

  private assertManagedObjectKey(objectKey: string, prefix: string) {
    const normalized = String(objectKey ?? '').trim().replace(/^\/+/, '');
    if (!normalized || !normalized.startsWith(`${prefix}/`)) {
      throw new NotFoundException('对象路径不属于当前媒体存储前缀');
    }
  }

  private resolveExtension(mimeType: string) {
    const mapping: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    return mapping[mimeType] ?? 'bin';
  }

  private resolveOrientedDimensions(metadata: Metadata) {
    const width = metadata.width ?? null;
    const height = metadata.height ?? null;
    if (!width || !height) return { width, height };
    const orientation = metadata.orientation ?? 1;
    if ([5, 6, 7, 8].includes(orientation)) {
      return { width: height, height: width };
    }
    return { width, height };
  }
}
