import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UploadFile } from '@prisma/client';
import type { Express, Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { OssStorageProvider } from './providers/oss-storage.provider';
import { TencentCosStorageProvider, type FileAccessVariant } from './providers/tencent-cos-storage.provider';
import { FILE_STORAGE, type FileStorageProvider } from './providers/storage.provider';

const UPLOAD_SCENE_RULES: Record<string, { maxSize: number; mimeTypes: string[] }> = {
  USER_AVATAR: { maxSize: 2 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  TASK_COVER: { maxSize: 5 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  TASK_CLAIM_PROOF: { maxSize: 10 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  TASK_SETTLEMENT_PROOF: { maxSize: 10 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  TENANT_ATTACHMENT: { maxSize: 20 * 1024 * 1024, mimeTypes: [] },
  WEBSITE_ASSET: {
    maxSize: 5 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/ico'],
  },
};

type FileReference = Pick<
  UploadFile,
  | 'id'
  | 'storageDriver'
  | 'bucket'
  | 'objectKey'
  | 'thumbnailObjectKey'
  | 'url'
>;

export type ResolvedFileAccess = {
  url: string;
  expiresAt: string | null;
  variant: FileAccessVariant;
  fallbackToOriginal: boolean;
};

@Injectable()
export class FilesService {
  constructor(
    @Inject(FILE_STORAGE) private readonly storageProvider: FileStorageProvider,
    private readonly localStorageProvider: LocalStorageProvider,
    private readonly ossStorageProvider: OssStorageProvider,
    private readonly tencentCosStorageProvider: TencentCosStorageProvider,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 通用临时上传：新增业务表单中，业务 id 还没有生成时使用。
   * scene 只表示用途，真正的大小和 MIME 校验必须由后端规则决定。
   */
  async upload(userId: string, file: Express.Multer.File, scene?: string) {
    return this.saveUpload({ uploaderId: userId }, file, scene);
  }

  async uploadMemberProof(memberId: string, file: Express.Multer.File, scene?: string) {
    if (scene !== 'TASK_CLAIM_PROOF') throw new BadRequestException('成员仅可上传任务凭证图片');
    return this.saveUpload({ memberId }, file, scene);
  }

  private async saveUpload(owner: { uploaderId: string } | { memberId: string }, file: Express.Multer.File, scene?: string) {
    this.validateSceneMeta({ size: file.size, mimeType: file.mimetype }, scene);
    const stored = await this.resolveUploadStorage(scene).save(file);
    try {
      return await this.prisma.uploadFile.create({
        data: {
          ...owner,
          scene,
          status: 'TEMP',
          storageDriver: stored.driver,
          bucket: stored.bucket,
          objectKey: stored.objectKey,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url: stored.url,
          thumbnailObjectKey: stored.thumbnailObjectKey ?? null,
          thumbnailMimeType: stored.thumbnailMimeType ?? null,
          thumbnailSize: stored.thumbnailSize ?? null,
          imageWidth: stored.imageWidth ?? null,
          imageHeight: stored.imageHeight ?? null,
        },
      });
    } catch (error) {
      if (stored.driver === 'tencent_cos') {
        await this.tencentCosStorageProvider.cleanupStoredFile({
          bucket: stored.bucket,
          objectKey: stored.objectKey,
          thumbnailObjectKey: stored.thumbnailObjectKey,
        });
      }
      throw error;
    }
  }

  async createDirectUpload(userId: string, params: { fileName: string; mimeType: string; size: number; scene?: string }) {
    this.validateSceneMeta({ size: params.size, mimeType: params.mimeType }, params.scene);
    this.assertPrivateTencentCosSceneUsesServerUpload(params.scene);
    const presigned = await this.storageProvider.createPresignedUpload({
      fileName: params.fileName,
      mimeType: params.mimeType,
    });

    return {
      uploaderId: userId,
      scene: params.scene,
      storageDriver: presigned.driver,
      bucket: presigned.bucket,
      objectKey: presigned.objectKey,
      originalName: params.fileName,
      mimeType: params.mimeType,
      size: params.size,
      url: presigned.url,
      rawUrl: presigned.url,
      fullUrl: presigned.url,
      uploadUrl: presigned.uploadUrl,
      method: presigned.method,
      headers: presigned.headers,
      expireAt: presigned.expireAt,
    };
  }

  async completeDirectUpload(
    userId: string,
    params: { objectKey: string; originalName: string; mimeType: string; size: number; scene?: string },
  ) {
    this.validateSceneMeta({ size: params.size, mimeType: params.mimeType }, params.scene);
    this.assertPrivateTencentCosSceneUsesServerUpload(params.scene);
    await this.storageProvider.assertObjectExists(params.objectKey);
    const url = this.storageProvider.buildObjectUrl(params.objectKey);
    const bucket = this.resolveCurrentBucket();

    return this.prisma.uploadFile.create({
      data: {
        uploaderId: userId,
        scene: params.scene,
        status: 'TEMP',
        storageDriver: this.storageProvider.getDriver(),
        bucket,
        objectKey: params.objectKey,
        originalName: params.originalName,
        mimeType: params.mimeType,
        size: params.size,
        url,
      },
    });
  }

  async listMine(userId: string) {
    return this.prisma.uploadFile.findMany({
      where: { uploaderId: userId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFile(id: string) {
    const file = await this.prisma.uploadFile.findUnique({ where: { id } });
    if (!file || file.status === 'DELETED') {
      throw new NotFoundException('File not found');
    }
    return file;
  }

  async getFileByUrl(url: string) {
    const trimmedUrl = String(url ?? '').trim();
    if (!trimmedUrl) {
      throw new NotFoundException('File not found');
    }

    const candidates = Array.from(
      new Set(
        [trimmedUrl, this.extractPathname(trimmedUrl)]
          .map((item) => String(item ?? '').trim())
          .filter(Boolean),
      ),
    );

    const directMatch = await this.prisma.uploadFile.findFirst({
      where: {
        status: { not: 'DELETED' },
        url: { in: candidates },
      },
    });
    if (directMatch) return directMatch;

    // Legacy H5 clients can still submit a signed Tencent COS URL instead of fileId.
    // Only the object key is used for lookup; the bucket is verified before a new URL is signed.
    const objectKey = this.extractTencentCosObjectKey(trimmedUrl);
    if (objectKey) {
      const file = await this.prisma.uploadFile.findFirst({
        where: {
          status: { not: 'DELETED' },
          storageDriver: 'tencent_cos',
          objectKey,
        },
      });
      if (file) return file;
    }

    throw new NotFoundException('File not found');
  }

  /** 将临时文件绑定到业务对象，并把文件状态改为 ACTIVE。 */
  async activateAndBind(fileId: string, params: { bizType: string; bizId: string; fieldName: string }) {
    await this.getFile(fileId);
    await this.prisma.fileUsage.create({ data: { fileId, ...params } });
    return this.prisma.uploadFile.update({ where: { id: fileId }, data: { status: 'ACTIVE' } });
  }

  async bindMany(fileIds: string[] | undefined, params: { bizType: string; bizId: string; fieldName: string }) {
    if (!fileIds?.length) return [];
    return Promise.all(fileIds.map((fileId) => this.activateAndBind(fileId, params)));
  }

  async getReadAccess(file: FileReference, variant: FileAccessVariant = 'original'): Promise<ResolvedFileAccess> {
    if (file.storageDriver === 'tencent_cos') {
      return this.tencentCosStorageProvider.createSignedReadUrl({
        bucket: file.bucket,
        objectKey: file.objectKey,
        thumbnailObjectKey: file.thumbnailObjectKey,
        variant,
      });
    }

    return {
      url: file.url,
      expiresAt: null,
      variant: 'original',
      fallbackToOriginal: variant === 'thumbnail',
    };
  }

  async getReadUrl(file: FileReference, variant: FileAccessVariant = 'original') {
    return (await this.getReadAccess(file, variant)).url;
  }

  /**
   * 仅在需要确认浏览器缓存是否仍可复用的场景调用。
   * 不在普通列表读取路径调用，避免为每个列表图片额外产生对象存储 HEAD 请求。
   */
  /**
   * 仅供后端受控处理链路读取图片二进制，例如 OCR。
   * 不返回任何长期公开地址，也不会暴露对象 Key 给客户端。
   */
  async readStoredObjectBuffer(file: FileReference) {
    const driver = String(file.storageDriver || '').trim();
    const objectKey = String(file.objectKey || '').trim();
    if (!objectKey) throw new NotFoundException('File object not found');

    if (driver === 'tencent_cos') {
      return this.tencentCosStorageProvider.getObjectBuffer(objectKey, file.bucket);
    }
    if (driver === 'local') {
      return this.localStorageProvider.getObjectBuffer(objectKey);
    }
    if (driver === 'oss') {
      return this.ossStorageProvider.getObjectBuffer(objectKey);
    }
    throw new NotFoundException('Unsupported file storage driver');
  }

  async assertStoredObjectExists(file: FileReference) {
    const driver = String(file.storageDriver || '').trim();
    const objectKey = String(file.objectKey || '').trim();
    if (!objectKey) {
      throw new NotFoundException('File object not found');
    }

    if (driver === 'tencent_cos') {
      await this.tencentCosStorageProvider.assertObjectExists(objectKey, file.bucket);
      return;
    }

    if (driver === 'local') {
      await this.localStorageProvider.assertObjectExists(objectKey);
      return;
    }

    if (driver === 'oss') {
      await this.ossStorageProvider.assertObjectExists(objectKey);
      return;
    }

    throw new NotFoundException('Unsupported file storage driver');
  }

  makeFullUrl(url: string, request?: Request) {
    if (/^https?:\/\//i.test(url)) return url;
    const baseUrl =
      this.resolveConfiguredBaseUrl() ||
      this.resolveBaseUrlFromRequest(request);
    if (!baseUrl) {
      return url;
    }
    return `${baseUrl}${url}`;
  }

  async toResponse<T extends FileReference>(file: T, request?: Request) {
    const access = await this.getReadAccess(file);
    const fullUrl = this.makeFullUrl(access.url, request);

    if (file.storageDriver === 'tencent_cos') {
      // Private COS object coordinates are server-side storage metadata. The client receives only a temporary read URL.
      const { bucket: _bucket, objectKey: _objectKey, thumbnailObjectKey: _thumbnailObjectKey, url: _rawUrl, ...safeFile } = file;
      return {
        ...safeFile,
        url: fullUrl,
        fullUrl,
        urlExpiresAt: access.expiresAt,
      };
    }

    return {
      ...file,
      rawUrl: file.url,
      url: fullUrl,
      fullUrl,
      urlExpiresAt: access.expiresAt,
    };
  }

  private resolveUploadStorage(scene?: string) {
    // 官网发布配置保存的是长期公开 URL，不能使用会过期的私有 COS 签名地址。
    if (scene === 'WEBSITE_ASSET') return this.storageProvider;
    return this.tencentCosStorageProvider.isEnabledForScene(scene)
      ? this.tencentCosStorageProvider
      : this.storageProvider;
  }

  private assertPrivateTencentCosSceneUsesServerUpload(scene?: string) {
    if (this.tencentCosStorageProvider.isEnabledForScene(scene)) {
      throw new BadRequestException('该敏感图片场景仅支持服务端上传处理');
    }
  }

  private resolveConfiguredBaseUrl() {
    const baseUrl = this.configService.get<string>('app.baseUrl');
    if (!baseUrl) return null;

    const trimmed = baseUrl.trim();
    if (!trimmed) return null;

    // Ignore development fallback to avoid leaking localhost links in deployed environments.
    if (/^https?:\/\/localhost(?::\d+)?$/i.test(trimmed)) {
      return null;
    }

    if (/^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(trimmed)) {
      return null;
    }

    return trimmed.replace(/\/+$/, '');
  }

  private resolveBaseUrlFromRequest(request?: Request) {
    if (!request) return null;

    const forwardedProto = request.headers['x-forwarded-proto'];
    const forwardedHost = request.headers['x-forwarded-host'];
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || request.get('host');

    if (!host) return null;

    const resolvedProto = proto || request.protocol || 'http';
    return `${resolvedProto}://${host}`.replace(/\/+$/, '');
  }

  private validateSceneMeta(file: { size: number; mimeType: string }, scene?: string) {
    if (!scene) return;
    const rule = UPLOAD_SCENE_RULES[scene];
    if (!rule) return;

    if (file.size > rule.maxSize) {
      throw new BadRequestException(`File exceeds scene limit: ${scene}`);
    }

    if (rule.mimeTypes.length > 0 && !rule.mimeTypes.includes(file.mimeType)) {
      throw new BadRequestException(`Invalid file type for scene: ${scene}`);
    }
  }

  private resolveCurrentBucket() {
    if (this.storageProvider.getDriver() !== 'oss') {
      return null;
    }

    return this.configService.get<string>('storage.oss.bucket', '').trim() || null;
  }

  private extractPathname(url: string) {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }

  private extractTencentCosObjectKey(url: string) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (!host.includes('.cos.') && !host.includes('.myqcloud.com')) {
        return null;
      }
      return decodeURIComponent(parsed.pathname).replace(/^\/+/, '') || null;
    } catch {
      const match = /^tencent-cos:\/\/[^/]+\/(.+)$/i.exec(url);
      return match?.[1] ? decodeURIComponent(match[1]) : null;
    }
  }
}
