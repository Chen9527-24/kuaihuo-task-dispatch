export function normalizePhone(value: unknown) {
  const raw = String(value ?? '').trim()
  const hasLeadingPlus = raw.startsWith('+')
  const digits = raw.replace(/[^0-9]/g, '')
  return `${hasLeadingPlus ? '+' : ''}${digits}`
}

export function isValidPhone(value: unknown) {
  return /^\+?[0-9]{6,20}$/.test(normalizePhone(value))
}
