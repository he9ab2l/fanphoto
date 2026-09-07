import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
const derive = promisify(scrypt)
export const token = () => randomBytes(32).toString('hex')
export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export const constantEqual = (a: string, b: string) => {
  const first = Buffer.from(a),
    second = Buffer.from(b)
  return first.length === second.length && timingSafeEqual(first, second)
}
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex')
  const key = (await derive(password, salt, 64)) as Buffer
  return `scrypt$${salt}$${key.toString('hex')}`
}
export async function verifyPassword(password: string, hash: string) {
  const [algorithm, salt, expected] = hash.split('$')
  if (
    algorithm !== 'scrypt' ||
    !/^[a-f0-9]{32}$/.test(salt || '') ||
    !/^[a-f0-9]{128}$/.test(expected || '')
  )
    return false
  const key = (await derive(password, salt, 64)) as Buffer
  return constantEqual(key.toString('hex'), expected)
}
