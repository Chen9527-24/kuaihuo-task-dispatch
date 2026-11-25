import type { Express } from 'express';

export type StorageDriver = 'local' | 'oss' | 'tencent_cos';

export type StoredFile = {
  driver: StorageDriver;
  bucket: string | null;
  objectKey: string;
  /** Stable storage reference. Private providers must not place permanent public URLs here. */
  url: string;
  thumbnailObjectKey?: string | null;
  thumbnailMimeType?: string | null;
  thumbnailSize?: number | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
};

export type PresignedUploadInput = {
  fileName: string;
  mimeType: string;
};

export type PresignedUpload = {
  driver: StorageDriver;
  bucket: string | null;
  objectKey: string;
  url: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expireAt: string;
};

export interface FileStorageProvider {
  getDriver(): StorageDriver;
  save(file: Express.Multer.File): Promise<StoredFile>;
  createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUpload>;
  buildObjectUrl(objectKey: string): string;
  assertObjectExists(objectKey: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
