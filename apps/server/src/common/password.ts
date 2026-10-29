import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** scrypt 存储，避免原生 bcrypt 依赖；格式 salt:hash */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(plain, salt, 64).toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = scryptSync(plain, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === computed.length && timingSafeEqual(computed, expected);
}
