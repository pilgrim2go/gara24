// Xác thực và phân quyền (G1-13).
// Production: Cloudflare Access đứng trước Worker và gắn JWT vào header Cf-Access-Jwt-Assertion.
// Worker PHẢI tự kiểm chữ ký JWT; không tin header email trần, vì ai gọi thẳng vào workers.dev cũng tự đặt được header.
import type { D1 } from '../lib.ts';
import { ROLES } from '../db/schema.ts';

export type Role = (typeof ROLES)[number];
export type Actor = { userId: string; email: string; branchId: string; roles: Role[] };

// Vai được thấy giá vốn. Cố vấn, thợ, thu ngân không bao giờ thấy (G1-13).
export const COST_ROLES: readonly Role[] = ['owner', 'manager', 'accountant', 'investor', 'storekeeper'];
export const seesCost = (a: Actor) => a.roles.some((r) => COST_ROLES.includes(r));

export const PERMS = {
  'wo.read': ROLES,
  'wo.create': ['owner', 'manager', 'advisor'],
  'wo.lines': ['owner', 'manager', 'advisor'],
  'wo.transition': ['owner', 'manager', 'advisor', 'technician'],
  'wo.issue': ['owner', 'manager', 'storekeeper'],
  'wo.cancel': ['owner', 'manager'],
  'wo.reopen': ['owner', 'manager'],
  'pay.intent': ['owner', 'manager', 'advisor', 'cashier'],
  'audit.read': ['owner', 'manager', 'accountant', 'advisor', 'technician', 'investor'],
  'dashboard.read': ['owner', 'manager', 'accountant', 'investor'],
} as const satisfies Record<string, readonly Role[]>;
export type Perm = keyof typeof PERMS;
export const can = (a: Actor, p: Perm) => a.roles.some((r) => (PERMS[p] as readonly Role[]).includes(r));

// ------------------------------------------------------------------ JWT của Cloudflare Access (RS256)
type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };
export type JwksFetcher = (teamDomain: string) => Promise<{ keys: Jwk[] }>;

const b64urlToBytes = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
};

let jwksCache: { at: number; teamDomain: string; keys: Jwk[] } | undefined;
const defaultFetcher: JwksFetcher = async (teamDomain) => {
  const r = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`certs ${r.status}`);
  return r.json();
};

export async function verifyAccessJwt(token: string, opt: { teamDomain: string; aud: string; now?: number; fetchJwks?: JwksFetcher }): Promise<{ email: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('jwt format');
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  if (header.alg !== 'RS256') throw new Error('jwt alg');
  const now = Math.floor((opt.now ?? Date.now()) / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('jwt expired');
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) throw new Error('jwt nbf');
  const auds: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(opt.aud)) throw new Error('jwt aud');
  if (payload.iss !== `https://${opt.teamDomain}`) throw new Error('jwt iss');

  const fetcher = opt.fetchJwks ?? defaultFetcher;
  if (!jwksCache || jwksCache.teamDomain !== opt.teamDomain || Date.now() - jwksCache.at > 3600_000 || !jwksCache.keys.some((k) => k.kid === header.kid)) {
    jwksCache = { at: Date.now(), teamDomain: opt.teamDomain, keys: (await fetcher(opt.teamDomain)).keys };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('jwt kid');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('jwt signature');
  if (typeof payload.email !== 'string') throw new Error('jwt email');
  return { email: payload.email.toLowerCase() };
}
export const _resetJwksCache = () => { jwksCache = undefined; };

// ------------------------------------------------------------------ tìm người dùng và vai theo chi nhánh
export async function resolveActor(db: D1, email: string, branchHeader: string | undefined): Promise<Actor | { error: 'unknown_user' | 'no_role' | 'branch_required' }> {
  const user = await db.prepare(`SELECT id FROM users WHERE email = ? AND status = 'active'`).bind(email).first<{ id: string }>();
  if (!user) return { error: 'unknown_user' };
  const { results } = await db.prepare(`SELECT branch_id, role FROM user_roles WHERE user_id = ? AND revoked_at IS NULL`).bind(user.id).all<{ branch_id: string; role: Role }>();
  const branches = [...new Set(results.map((r) => r.branch_id))];
  let branchId = branchHeader;
  if (!branchId) {
    if (branches.length !== 1) return { error: branches.length ? 'branch_required' : 'no_role' };
    branchId = branches[0];
  }
  const roles = results.filter((r) => r.branch_id === branchId).map((r) => r.role);
  if (!roles.length) return { error: 'no_role' };
  return { userId: user.id, email, branchId, roles };
}
