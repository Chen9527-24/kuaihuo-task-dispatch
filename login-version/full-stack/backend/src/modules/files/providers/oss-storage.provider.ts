import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import OSS from 'ali-oss';
import type { FileStorageProvider, PresignedUpload, PresignedUploadInput, StoredFile } from './storage.provider';

@Injectable()
export class OssStorageProvider implements FileStorageProvider {
  constructor(private readonly configService: ConfigService) {}

  getDriver() {
    return 'oss' as const;
  }

  async save(file: Express.Multer.File): Promise<StoredFile> {
    const {
      region,
      bucket,
      accessKeyId,
      accessKeySecret,
      endpoint,
      cdnBaseUrl,
      objectPrefix,
    } = this.getRequiredOssConfig();

    const client = this.createClient({ region, bucket, accessKeyId, accessKeySecret, endpoint });
    const objectKey = this.buildObjectKey(objectPrefix, file.originalname);

    try {
      const result = await client.put(objectKey, file.buffer, {
        mime: file.mimetype,
      });

      const url = this.buildStoredObjectUrl(cdnBaseUrl, objectKey, result.url);
      return {
        driver: 'oss',
        bucket,
        objectKey,
        url,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      throw new InternalServerErrorException(`OSS upload failed: ${message}`);
    }
  }

  async createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUpload> {
    const {
      region,
      bucket,
      accessKeyId,
      accessKeySecret,
      endpoint,
      cdnBaseUrl,
      objectPrefix,
    } = this.getRequiredOssConfig();
    const client = this.createClient({ region, bucket, accessKeyId, accessKeySecret, endpoint });
    const objectKey = this.buildObjectKey(objectPrefix, input.fileName);
    const expireSeconds = 10 * 60;
    const uploadUrl = await client.signatureUrl(objectKey, {
      expires: expireSeconds,
      method: 'PUT',
    });
    const url = this.buildStoredObjectUrl(cdnBaseUrl, objectKey);

    return {
      driver: 'oss',
      bucket,
      objectKey,
      url,
      uploadUrl,
      method: 'PUT',
      headers: {
        'Content-Type': input.mimeType,
      },
      expireAt: new Date(Date.now() + expireSeconds * 1000).toISOString(),
    };
  }

  buildObjectUrl(objectKey: string) {
    const { cdnBaseUrl } = this.getRequiredOssConfig();
    return this.buildPublicObjectUrl(objectKey, cdnBaseUrl);
  }

  async assertObjectExists(objectKey: string) {
    const { region, bucket, accessKeyId, accessKeySecret, endpoint } = this.getRequiredOssConfig();
    const client = this.createClient({ region, bucket, accessKeyId, accessKeySecret, endpoint });

    try {
      await client.head(objectKey);
    } catch (error: any) {
      const statusCode = Number(error?.status || error?.statusCode || 0);
      const code = String(error?.code || '').trim();
      if (code === 'NoSuchKey' || code === 'NoSuchObject' || (statusCode === 404 && code !== 'NoSuchBucket')) {
        throw new NotFoundException('Uploaded object not found in OSS');
      }
      throw new InternalServerErrorException('OSS 文件存在性校验失败，请稍后重试');
    }
  }

  /** 仅供后端受控服务读取对象内容。 */
  async getObjectBuffer(objectKey: string) {
    const { region, bucket, accessKeyId, accessKeySecret, endpoint } = this.getRequiredOssConfig();
    const client = this.createClient({ region, bucket, accessKeyId, accessKeySecret, endpoint });
    try {
      const result = await client.get(objectKey);
      const content = (result as any)?.content;
      if (Buffer.isBuffer(content)) return content;
      if (typeof content === 'string') return Buffer.from(content);
      throw new Error('OSS response has no buffer body');
    } catch (error: any) {
      const statusCode = Number(error?.status || error?.statusCode || 0);
      const code = String(error?.code || '').trim();
      if (code === 'NoSuchKey' || code === 'NoSuchObject' || (statusCode === 404 && code !== 'NoSuchBucket')) {
        throw new NotFoundException('Uploaded object not found in OSS');
      }
      throw new InternalServerErrorException('OSS 文件读取失败，请稍后重试');
    }
  }

  private getRequiredOssConfig() {
    const region = this.configService.get<string>('storage.oss.region', '').trim();
    const bucket = this.configService.get<string>('storage.oss.bucket', '').trim();
    const accessKeyId = this.configService.get<string>('storage.oss.accessKeyId', '').trim();
    const accessKeySecret = this.configService.get<string>('storage.oss.accessKeySecret', '').trim();
    const endpoint = this.configService.get<string>('storage.oss.endpoint', '').trim();
    const cdnBaseUrl = this.configService.get<string>('storage.oss.cdnBaseUrl', '').trim();
    const objectPrefix = this.configService.get<string>('storage.oss.objectPrefix', 'uploads').trim() || 'uploads';

    const missing = [
      ['OSS_REGION', region],
      ['OSS_BUCKET', bucket],
      ['OSS_ACCESS_KEY_ID', accessKeyId],
      ['OSS_ACCESS_KEY_SECRET', accessKeySecret],
    ]
      .filter((item) => !item[1])
      .map((item) => item[0]);

    if (missing.length > 0) {
      throw new InternalServerErrorException(`OSS configuration missing: ${missing.join(', ')}`);
    }

    const placeholders = [
      ['OSS_BUCKET', bucket, 'your-bucket-name'],
      ['OSS_ACCESS_KEY_ID', accessKeyId, 'your-access-key-id'],
      ['OSS_ACCESS_KEY_SECRET', accessKeySecret, 'your-access-key-secret'],
    ].filter((item) => item[1] === item[2]);

    if (placeholders.length > 0) {
      throw new InternalServerErrorException(
        `OSS configuration is using example placeholder values: ${placeholders.map((item) => item[0]).join(', ')}`,
      );
    }

    return { region, bucket, accessKeyId, accessKeySecret, endpoint, cdnBaseUrl, objectPrefix };
  }

  private buildStoredObjectUrl(cdnBaseUrl: string, objectKey: string, resultUrl?: string) {
    if (cdnBaseUrl) {
      return `${cdnBaseUrl.replace(/\/+$/, '')}/${objectKey}`;
    }
    if (resultUrl) {
      return resultUrl;
    }
    return this.buildPublicObjectUrl(objectKey, cdnBaseUrl);
  }

  private buildPublicObjectUrl(objectKey: string, cdnBaseUrl: string) {
    if (cdnBaseUrl) {
      return `${cdnBaseUrl.replace(/\/+$/, '')}/${objectKey}`;
    }

    const { bucket, endpoint, region } = this.getRequiredOssConfig();
    if (endpoint) {
      return `https://${bucket}.${endpoint.replace(/^https?:\/\//i, '')}/${objectKey}`;
    }
    return `https://${bucket}.${region}.aliyuncs.com/${objectKey}`;
  }

  private formatDatePath(date: Date) {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  private createClient(params: {
    region: string;
    bucket: string;
    accessKeyId: string;
    accessKeySecret: string;
    endpoint: string;
  }) {
    return new OSS({
      region: params.region,
      bucket: params.bucket,
      accessKeyId: params.accessKeyId,
      accessKeySecret: params.accessKeySecret,
      endpoint: params.endpoint || undefined,
      secure: true,
    });
  }

  private buildObjectKey(objectPrefix: string, originalName: string) {
    const safeOriginalName = originalName.replace(/[^a-zA-Z0-9._-]/g, '-');
    return `${objectPrefix}/${this.formatDatePath(new Date())}/${randomUUID()}-${safeOriginalName}`;
  }
}
