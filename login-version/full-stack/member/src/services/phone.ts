export function normalizePhone(value?: string | null) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '')
  if (digits.length === 13 && digits.startsWith('86')) return digits.slice(2)
  return digits.slice(0, 11)
}

export function isValidPhone(value?: string | null) {
  return /^1[3-9]\d{9}$/.test(normalizePhone(value))
}
