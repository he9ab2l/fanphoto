const encoder = new TextEncoder()
export const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes instanceof Uint8Array ? bytes : bytes))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
export const randomToken = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)))
export async function digest(value: string | ArrayBuffer) {
  return hex(
    await crypto.subtle.digest(
      'SHA-256',
      typeof value === 'string' ? encoder.encode(value) : value,
    ),
  )
}
export function equal(a: string, b: string) {
  let diff = a.length ^ b.length
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}
export async function hashPassword(password: string, salt = randomToken(16)) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const result = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256,
  )
  return `pbkdf2-sha256$100000$${salt}$${hex(result)}`
}
export async function verifyPassword(password: string, hash: string) {
  const parts = hash.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256' || parts[1] !== '100000') return false
  return equal(await hashPassword(password, parts[2]), hash)
}
