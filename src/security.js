import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.js';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(24).toString('base64url');
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  const [scheme, salt, hash] = String(encoded || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = Buffer.from(await scrypt(password, salt, expected.length));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function newOpaqueToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function jwtKey() {
  return new TextEncoder().encode(config.jwtSecret);
}

export async function signAccessToken({ userId, sessionId }) {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer('karven')
    .setAudience('karven-api')
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenMinutes}m`)
    .sign(jwtKey());
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, jwtKey(), {
    issuer: 'karven',
    audience: 'karven-api'
  });
  return payload;
}

export function safeEqualText(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
