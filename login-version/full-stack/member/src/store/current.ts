import { defineStore } from 'pinia'
import { resolveDefaultTenantsId } from '@/constant'

const STORAGE_KEY = 'currentPostStore'
const DEFAULT_TENANTS_ID = resolveDefaultTenantsId()

function readPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export const useCurrentPostStore = defineStore('currentPost', {
  state: () => {
    const saved = readPersisted()
    return {
      tenantsId: DEFAULT_TENANTS_ID,
      currentPostId: saved.currentPostId ?? null,
      postIndex: saved.postIndex ?? 0,
      progressPercent: saved.progressPercent ?? 0,
      externalUserName: saved.externalUserName ?? '',
      externalUserPhone: saved.externalUserPhone ?? '',
      paymentCodeImage: saved.paymentCodeImage ?? '',
      paymentCodeFileId: saved.paymentCodeFileId ?? '',
      proofImages: Array.isArray(saved.proofImages) ? saved.proofImages : (saved.paymentCodeImage ? [saved.paymentCodeImage] : []),
      proofFileIds: Array.isArray(saved.proofFileIds) ? saved.proofFileIds : (saved.paymentCodeFileId ? [saved.paymentCodeFileId] : []),
      visitorToken: saved.visitorToken ?? '',
      curSelectComment: saved.curSelectComment ?? '',
      claimedCommentId: saved.claimedCommentId ?? '',
    }
  },
  actions: {
    setTenantsId(v: string | number) {
      ;(this as any).tenantsId = v
      this.persist()
    },
    setCurrentPostId(v: string | number | null) {
      ;(this as any).currentPostId = v
      this.persist()
    },
    setPostIndex(v: number) {
      ;(this as any).postIndex = v
      this.persist()
    },
    setProgressPercent(v: number) {
      ;(this as any).progressPercent = v
      this.persist()
    },
    setExternalUserName(v: string) {
      ;(this as any).externalUserName = v
      this.persist()
    },
    setExternalUserPhone(v: string) {
      ;(this as any).externalUserPhone = v
      this.persist()
    },
    setPaymentCodeImage(v: string) {
      ;(this as any).paymentCodeImage = v
      this.persist()
    },
    setPaymentCodeFileId(v: string) {
      ;(this as any).paymentCodeFileId = v
      this.persist()
    },
    setProofImages(v: string[]) {
      ;(this as any).proofImages = Array.isArray(v) ? v : []
      this.persist()
    },
    setProofFileIds(v: string[]) {
      ;(this as any).proofFileIds = Array.isArray(v) ? v : []
      this.persist()
    },
    setVisitorToken(v: string) {
      ;(this as any).visitorToken = String(v ?? '')
      this.persist()
    },
    setCurSelectComment(v: string) {
      ;(this as any).curSelectComment = v
      this.persist()
    },
    setClaimedCommentId(v: string | number) {
      ;(this as any).claimedCommentId = String(v ?? '')
      this.persist()
    },
    persist() {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            tenantsId: (this as any).tenantsId,
            currentPostId: (this as any).currentPostId,
            postIndex: (this as any).postIndex,
            progressPercent: (this as any).progressPercent,
            externalUserName: (this as any).externalUserName,
            externalUserPhone: (this as any).externalUserPhone,
            paymentCodeImage: (this as any).paymentCodeImage,
            paymentCodeFileId: (this as any).paymentCodeFileId,
            proofImages: (this as any).proofImages,
            proofFileIds: (this as any).proofFileIds,
            visitorToken: (this as any).visitorToken,
            curSelectComment: (this as any).curSelectComment,
            claimedCommentId: (this as any).claimedCommentId,
          }),
        )
      } catch {}
    },
  },
})
