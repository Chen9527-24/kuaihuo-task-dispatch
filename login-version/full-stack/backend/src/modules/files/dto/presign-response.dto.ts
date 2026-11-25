export class PresignResponseDto {
  uploaderId!: string;
  scene?: string;
  storageDriver!: string;
  bucket!: string | null;
  objectKey!: string;
  originalName!: string;
  mimeType!: string;
  size!: number;
  url!: string;
  rawUrl!: string;
  fullUrl!: string;
  uploadUrl!: string;
  method!: 'PUT';
  headers!: Record<string, string>;
  expireAt!: string;
}
