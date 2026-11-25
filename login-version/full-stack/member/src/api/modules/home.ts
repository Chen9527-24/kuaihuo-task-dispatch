import http from '@/services/http'

export async function getHotList() {
  return http.get(`/posts/tenant`)
}

export async function getPostDetail(douyinId: string | number) {
  return http.get(`/claim-comment/${douyinId}`)
}

export async function complete(data: any) {
  return http.get(`/claim-comment/complete`, { params: data })
}

export async function claimComment(data: any) {
  return http.post(`/claim-comment`, data)
}

export async function uploadTaskAttachments(data: FormData) {
  return http.post('/files/upload', data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

export async function publicUploadFile(data: FormData) {
  return http.post('/app/files/upload', data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

export async function publicClaimComment(taskId: string, data: any) {
  return http.post(`/app/daily-tasks/${taskId}/claim-comment`, data)
}

export async function publicConfirmComplete(taskId: string, data: any) {
  return http.post(`/app/daily-tasks/${taskId}/confirm-completion`, data)
}

export async function publicStartTask(taskId: string, data: any) {
  return http.post(`/app/daily-tasks/${taskId}/public-start`, data)
}

export async function sendDistributionSmsCode(data: any) {
  return http.post('/app/distribution/sms/send-code', data)
}

export async function distributionLogin(data: any) {
  return http.post('/app/distribution/auth/login', data)
}

export async function distributionUpdateProfile(data: any) {
  return http.post('/app/distribution/profile', data)
}

export async function getDistributionMe(params: any = {}) {
  return http.get('/app/distribution/me', { params })
}

/** 提交成为团长的申请；审核通过后由后台建立团长团队并切换身份。 */
export async function applyDistributionLeader(data: { requestedGroupName: string; reason?: string; contactPhone?: string; agreedToLeaderRules: boolean }) {
  return http.post('/app/distribution/leader-applications', data)
}

export async function getDistributionTasks(params: any) {
  return http.get('/app/distribution/tasks', { params })
}

export async function claimDistributionTask(data: any) {
  return http.post('/app/distribution/tasks/claim', data)
}

export async function claimDistributionCurrentComment(data: any = {}) {
  return http.post('/app/distribution/tasks/current/claim-comment', data)
}

export async function abandonDistributionCurrentTask(data: any = {}) {
  return http.post('/app/distribution/tasks/abandon-current', data)
}


export async function completeDistributionCurrentTask(data: any) {
  return http.post('/app/distribution/tasks/current/complete', data)
}

export async function retainDistributionHomepageProof(data: { fileId: string; platform: string; taskAccountId?: string }) {
  return http.post('/app/distribution/homepage-proofs/retain', data)
}

export async function getDistributionHomepageProofAccess(fileId: string, platform: string, taskAccountId?: string) {
  return http.get(`/app/distribution/homepage-proofs/${encodeURIComponent(fileId)}/access`, { params: { platform, taskAccountId } })
}

export async function requestDistributionHomepageProofRecognition(fileId: string, data: { platform: string; taskAccountId?: string }) {
  return http.post(`/app/distribution/homepage-proofs/${encodeURIComponent(fileId)}/recognition`, data)
}

export async function getDistributionHomepageProofRecognition(fileId: string, params: { platform: string; taskAccountId?: string }) {
  return http.get(`/app/distribution/homepage-proofs/${encodeURIComponent(fileId)}/recognition`, { params })
}

export async function resubmitRejectedDistributionTask(participantId: string) {
  return http.post(`/app/distribution/tasks/${participantId}/resubmit`)
}


export async function getDistributionOrders(params: any) {
  return http.get('/app/distribution/orders', { params })
}

export async function createDistributionWithdrawal(data: any) {
  return http.post('/app/distribution/withdrawals', data)
}

export async function getDistributionWithdrawals(params: any = {}) {
  return http.get('/app/distribution/withdrawals', { params })
}

export async function mockConfirmDistributionWithdrawal(id: string) {
  return http.post(`/app/distribution/withdrawals/${id}/mock-confirm`)
}

export async function cancelDistributionWithdrawal(id: string) {
  return http.post(`/app/distribution/withdrawals/${id}/cancel`)
}

export async function syncDistributionWithdrawal(id: string) {
  return http.post(`/app/distribution/withdrawals/${id}/sync`)
}

export async function getWechatJsSdkSignature(url: string) {
  return http.get('/wechat/js-sdk-signature', { params: { url } })
}


export async function getDistributionLeaderCenter(params: any = {}) {
  return http.get('/app/distribution/leader-center', { params })
}

export async function getDistributionInviteDetail(code: string) {
  return http.get(`/app/distribution/invite/${encodeURIComponent(code)}`)
}

export async function bindDistributionInvite(data: any) {
  return http.post('/app/distribution/bind-invite', data)
}

export async function getDistributionLeaderCodeDetail(code: string) {
  return http.get(`/app/distribution/leader-code/${encodeURIComponent(code)}`)
}

export async function bindDistributionLeaderCode(data: any) {
  return http.post('/app/distribution/bind-leader-code', data)
}

export async function getDistributionTaskAccounts() {
  return http.get('/app/distribution/task-accounts')
}

export async function createDistributionTaskAccount(data: any) {
  return http.post('/app/distribution/task-accounts', data)
}

export async function switchDistributionTaskAccount(id: string) {
  return http.post(`/app/distribution/task-accounts/${id}/switch`)
}
