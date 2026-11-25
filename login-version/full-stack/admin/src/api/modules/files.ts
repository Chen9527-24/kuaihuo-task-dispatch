import { request } from '@/api/core/http';
import { unwrapData } from '@/utils/apiData';

export interface UploadFileResponse {
  id: string;
  url: string;
  fullUrl?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  scene?: string;
  status?: string;
}

export async function getMyFiles() {
  return request<unknown>({
    path: '/files/mine'
  });
}

export async function uploadFile(file: File, scene?: string): Promise<UploadFileResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (scene) formData.append('scene', scene);

  const payload = await request<unknown>({
    path: '/files/upload',
    method: 'POST',
    body: formData
  });

  return unwrapData<UploadFileResponse>(payload);
}
