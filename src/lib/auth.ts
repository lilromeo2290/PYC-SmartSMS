import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

// ============ SESSION AUTH (httpOnly signed cookie, server-side enforced) ============

const SESSION_NAME = 'pyc_session';
const SESSION_TTL_HOURS = 24;

function secret(): string {
  return process.env.APP_SECRET || 'pyc-smartsms-default-secret-key-2026';
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export interface SessionData {
  userId: string;
  username: string;
  role: string;
  exp: number; // epoch ms
}

export function createToken(data: Omit<SessionData, 'exp'>): string {
  const sd: SessionData = { ...data, exp: Date.now() + SESSION_TTL_HOURS * 3600_000 };
  const payload = Buffer.from(JSON.stringify(sd)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined | null): SessionData | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const sd = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionData;
    if (!sd.exp || sd.exp < Date.now()) return null;
    return sd;
  } catch {
    return null;
  }
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function checkPassword(plain: string, hash: string): boolean {
  try { return bcrypt.compareSync(plain, hash); } catch { return false; }
}

export function readSession(req: NextRequest): SessionData | null {
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${SESSION_NAME}=([^;]+)`));
  return verifyToken(match ? decodeURIComponent(match[1]) : null);
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_HOURS * 3600,
    path: '/',
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_NAME, '', { httpOnly: true, maxAge: 0, path: '/' });
}

// ============ PERMISSIONS (database-driven, server-side) ============

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  permissions: string[];
}

export async function loadUser(userId: string): Promise<AuthUser | null> {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || !u.isActive) return null;
  const rp = await db.rolePermission.findMany({ where: { role: u.role, allowed: true } });
  const base = rp.map(r => r.permissionKey);
  let extra: string[] = [], denied: string[] = [];
  try { extra = JSON.parse(u.extraPermissions); } catch {}
  try { denied = JSON.parse(u.deniedPermissions); } catch {}
  const perms = new Set([...base, ...extra]);
  denied.forEach(d => perms.delete(d));
  return {
    id: u.id, username: u.username, fullName: u.fullName, role: u.role,
    permissions: Array.from(perms),
  };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** Resolve current user or throw 401. */
export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const session = readSession(req);
  if (!session) throw new HttpError(401, 'Not authenticated. Please sign in.');
  const user = await loadUser(session.userId);
  if (!user) throw new HttpError(401, 'Session invalid or user deactivated.');
  return user;
}

/** Resolve current user and require a permission or throw 403. */
export async function requirePerm(req: NextRequest, permission: string): Promise<AuthUser> {
  const user = await requireUser(req);
  if (user.role !== 'SUPER_ADMIN' && !user.permissions.includes(permission)) {
    throw new HttpError(403, `Permission denied — requires "${permission}".`);
  }
  return user;
}

export function hasPerm(user: AuthUser, permission: string): boolean {
  return user.role === 'SUPER_ADMIN' || user.permissions.includes(permission);
}

// ============ API HELPERS ============

export function jsonError(e: unknown) {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const msg = e instanceof Error ? e.message : 'Unexpected server error';
  console.error('[API]', e);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip') || 'local';
}

// ============ RATE LIMITING (in-memory) ============

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= max;
}
