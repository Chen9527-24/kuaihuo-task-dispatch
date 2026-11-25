export class UploadResponseDto {
  id!: string;
  storageDriver!: string;
  bucket!: string | null;
  objectKey!: string;
  originalName!: string;
  mimeType!: string;
  size!: number;
  url!: string;
  createdAt!: Date;
}
