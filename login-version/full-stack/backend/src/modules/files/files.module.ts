import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesController } from './files.controller';
import { MemberFilesController } from './member-files.controller';
import { MemberUploadGuard } from './member-upload.guard';
import { FilesService } from './files.service';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { OssStorageProvider } from './providers/oss-storage.provider';
import { TencentCosStorageProvider } from './providers/tencent-cos-storage.provider';
import { FILE_STORAGE } from './providers/storage.provider';

function hasUsableOssConfig(configService: ConfigService) {
  const region = configService.get<string>('storage.oss.region', '').trim();
  const bucket = configService.get<string>('storage.oss.bucket', '').trim();
  const accessKeyId = configService.get<string>('storage.oss.accessKeyId', '').trim();
  const accessKeySecret = configService.get<string>('storage.oss.accessKeySecret', '').trim();
  const placeholders = new Set(['your-bucket-name', 'your-access-key-id', 'your-access-key-secret']);
  return Boolean(
    region &&
      bucket &&
      accessKeyId &&
      accessKeySecret &&
      !placeholders.has(bucket) &&
      !placeholders.has(accessKeyId) &&
      !placeholders.has(accessKeySecret),
  );
}

@Module({
  controllers: [FilesController, MemberFilesController],
  providers: [
    MemberUploadGuard,
    LocalStorageProvider,
    OssStorageProvider,
    TencentCosStorageProvider,
    {
      provide: FILE_STORAGE,
      inject: [ConfigService, LocalStorageProvider, OssStorageProvider],
      useFactory: (
        configService: ConfigService,
        localStorageProvider: LocalStorageProvider,
        ossStorageProvider: OssStorageProvider,
      ) => {
        const driver = configService.get<string>('storage.driver', 'local');
        if (driver === 'oss') {
          return ossStorageProvider;
        }

        // Prefer OSS automatically when the environment already provides a complete OSS config.
        if (hasUsableOssConfig(configService)) {
          return ossStorageProvider;
        }

        return localStorageProvider;
      },
    },
    FilesService,
  ],
  exports: [FilesService],
})
export class FilesModule {}
