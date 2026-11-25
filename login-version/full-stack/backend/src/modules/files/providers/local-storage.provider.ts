import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import type { FileStorageProvider, PresignedUpload, PresignedUploadInput, StoredFile } from './storage.provider';

@Injectable()
export class LocalStorageProvider implements FileStorageProvider {
  constructor(private readonly configService: ConfigService) {}

  getDriver() {
    return 'local' as const;
  }

  async save(file: Express.Multer.File): Promise<StoredFile> {
    const directory = this.configService.get<string>('storage.localUploadDir', 'uploads');
    // Use the validated MIME for disk names; keep the user-facing name in the DB.
    const extensions: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
    const filename = randomUUID() + (extensions[file.mimetype] || '.bin');
    const fullDir = join(process.cwd(), directory);
    const fullPath = join(fullDir, filename);
    await fs.mkdir(fullDir, { recursive: true });
    await fs.writeFile(fullPath, file.buffer);

    return {
      driver: 'local',
      bucket: null,
      objectKey: filename,
      url: `/${directory}/${filename}`,
    };
  }

  async createPresignedUpload(_input: PresignedUploadInput): Promise<PresignedUpload> {
    throw new BadRequestException('Direct upload is only available when OSS storage is enabled');
  }

  buildObjectUrl(objectKey: string) {
    const directory = this.configService.get<string>('storage.localUploadDir', 'uploads');
    return `/${directory}/${objectKey}`;
  }

  async assertObjectExists(objectKey: string) {
    const directory = this.configService.get<string>('storage.localUploadDir', 'uploads');
    const fullPath = join(process.cwd(), directory, objectKey);

    try {
      await fs.access(fullPath);
    } catch (error: any) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
        throw new NotFoundException('Uploaded file not found');
      }
      throw new InternalServerErrorException('本地文件存在性校验失败，请稍后重试');
    }
  }

  /** 仅供后端受控服务（如 OCR）读取；不会向客户端暴露本地绝对路径。 */
  async getObjectBuffer(objectKey: string) {
    const directory = this.configService.get<string>('storage.localUploadDir', 'uploads');
    const fullPath = join(process.cwd(), directory, objectKey);
    try {
      return await fs.readFile(fullPath);
    } catch (error: any) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
        throw new NotFoundException('Uploaded file not found');
      }
      throw new InternalServerErrorException('本地文件读取失败，请稍后重试');
    }
  }
}
