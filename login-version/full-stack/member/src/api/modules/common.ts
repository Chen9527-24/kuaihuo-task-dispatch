import http from '@/services/http'

export interface UploadSignedResp {
  url: string
  filepath?: string
  viewUrl?: string
  [key: string]: any
}

const apiCommon = {
  async getUploadUrl(name: string): Promise<UploadSignedResp> {
    const resp: any = await http.post('/cos/upload-url', { name })
    return resp?.data || resp
  },
}

export default apiCommon
