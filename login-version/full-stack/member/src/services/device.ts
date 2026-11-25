export type MobileOS = 'ios' | 'android' | 'other'

export const detectMobileOS = (userAgent?: string): MobileOS => {
  const ua = String(userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '')).toLowerCase()
  if (/iphone|ipad|ipod|ios/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'other'
}
