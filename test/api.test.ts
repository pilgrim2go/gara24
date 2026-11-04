import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv7, runBatch } from '../src/lib.ts';
import { receiveStock } from '../src/ops.ts';
import { api } from '../src/api/routes.ts';
import { verifyAccessJwt, _resetJwksCache, type Role } from '../src/api/auth.ts';
import { getDb, closeDb, newBranch, newItem, NOW, assertInvariants } from './helpers.ts';

after(closeDb);
const app = api();
const SECRET = 'whsec-test-secret';

async function seedUser(db: any, branchId: string, roles: Role[], name: string) {
  const id = uuidv7(), email = `${name}.${id.slice(-8)}@gara24.test`;
  await runBatch(db, [
    db.prepare(`INSERT INTO users(id, branch_id, full_name, email) VALUES (?, ?, ?, ?)`).bind(id, branchId, name, email),
    ...roles.map((r) => db.prepare(`INSERT INTO user_roles(user_id, branch_id, role, granted_by) VALUES (?, ?, ?, 'seed')`).bind(id, branchId, r)),
  ]);
  return email;
}

function client(env: any) {
  return async (method: string, path: string, as: string | null, payload?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...extra };
    if (as) headers['x-dev-user-email'] = as;
    if (method !== 'GET' && !('idempotency-key' in extra)) headers['idempotency-key'] = uuidv7();
    const res = await app.request(path, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) }, env);
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
}

async function sign(raw: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Quét sâu: không khóa nào chứa giá vốn/lãi được xuất hiện trong phản hồi cho cố vấn/thợ
const FORBIDDEN = /cost|profit|margin|stock_moves|value_vnd/i;
function leakedKeys(x: unknown, path = ''): string[] {
  if (Array.isArray(x)) return x.flatMap((e, i) => leakedKeys(e, `${path}[${i}]`));
  if (x && typeof x === 'object') return Object.entries(x).flatMap(([k, val]) => [...(FORBIDDEN.test(k) ? [`${path}.${k}`] : []), ...leakedKeys(val, `${path}.${k}`)]);
  return [];
}

describe('API theo vai', () => {
  let db: any, env: any, call: ReturnType<typeof client>, b: Awaited<ReturnType<typeof newBranch>>;
  let owner: string, advisor: string, tech: string, store: string, investor: string, item: string, woId: string, partLineId: string;

  before(async () => {
    db = await getDb();
    b = await newBranch(db);
    env = { DB: db, DEV_AUTH: '1', BANK_WEBHOOK_SECRET: SECRET, WEBHOOK_BRANCH_ID: b.branchId };
    call = client(env);
    [owner, advisor, tech, store, investor] = await Promise.all([
      seedUser(db, b.branchId, ['owner'], 'chu'), seedUser(db, b.branchId, ['advisor'], 'covan'),
      seedUser(db, b.branchId, ['technician'], 'tho'), seedUser(db, b.branchId, ['storekeeper'], 'kho'),
      seedUser(db, b.branchId, ['investor'], 'ndt'),
    ]);
    item = await newItem(db, b, 'MAPHANH');
    await receiveStock(db, { key: uuidv7(), branchId: b.branchId, userId: 'seed', docId: uuidv7(), warehouseId: b.warehouseId, now: NOW,
      lines: [{ move_id: uuidv7(), item_id: item, qty_m: 10_000, unit_cost_vnd: 100_000 }] });
  });

  it('1. không có danh tính thì 401; email lạ thì 403', async () => {
    assert.equal((await call('GET', '/api/work-orders/x', null)).status, 401);
    assert.equal((await call('GET', '/api/work-orders/x', 'nobody@gara24.test')).status, 403);
  });

  it('2. luồng đầy đủ qua API: cố vấn tạo lệnh, thủ kho xuất, webhook thu tiền, lệnh khóa', async () => {
    let r = await call('POST', '/api/work-orders', advisor, { vehicle_id: b.vehicleId });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    woId = r.json.id;
    partLineId = uuidv7();
    r = await call('POST', `/api/work-orders/${woId}/lines`, advisor, { expected_version: 1, lines: [
      { line_type: 'labor', description: 'Công thay má phanh', qty_m: 1000, unit_price_vnd: 500_000 },
      { id: partLineId, line_type: 'part', item_id: item, description: 'Má phanh', qty_m: 2000, unit_price_vnd: 200_000 }] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    r = await call('POST', `/api/work-orders/${woId}/transition`, advisor, { expected_version: r.json.version, to: 'approved' });
    assert.equal(r.status, 200);
    r = await call('POST', `/api/work-orders/${woId}/issue`, store, { warehouse_id: b.warehouseId, lines: [{ line_id: partLineId, item_id: item, qty_m: 2000 }] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.cost.parts_cost_vnd, 200_000);          // thủ kho thấy giá vốn

    const intent = await call('POST', `/api/work-orders/${woId}/payment-intents`, advisor);
    assert.equal(intent.status, 201);
    assert.equal(intent.json.amount_vnd, 900_000);
    const raw = JSON.stringify({ txn_id: `T-${uuidv7()}`, amount_vnd: 900_000, memo: `CK ${intent.json.transfer_ref} sua xe`, txn_at: NOW });
    const wh = await app.request('/webhooks/bank/bank-x', { method: 'POST', body: raw, headers: { 'x-signature': await sign(raw) } }, env);
    assert.deepEqual(await wh.json(), { status: 'matched' });
    const wh2 = await app.request('/webhooks/bank/bank-x', { method: 'POST', body: raw, headers: { 'x-signature': await sign(raw) } }, env);
    assert.deepEqual(await wh2.json(), { status: 'duplicate' });

    r = await call('GET', `/api/work-orders/${woId}`, owner);
    assert.equal(r.json.payment_status, 'paid');
    assert.equal(typeof r.json.locked_at, 'number');
    assert.deepEqual(r.json.cost, { parts_cost_vnd: 200_000, cost_status: 'final', gross_profit_vnd: 700_000, margin_bp: 7778 });
    await assertInvariants(db, b.branchId);
  });

  it('3. cố vấn và thợ không thấy giá vốn ở bất kỳ phản hồi nào', async () => {
    for (const who of [advisor, tech]) {
      const r = await call('GET', `/api/work-orders/${woId}`, who);
      assert.equal(r.status, 200);
      assert.deepEqual(leakedKeys(r.json), [], `lộ khóa cho ${who}`);
      const au = await call('GET', `/api/work-orders/${woId}/audit`, who);
      assert.equal(au.status, 200);
      assert.ok(!au.json.some((e: any) => e.action === 'issue'), 'cố vấn/thợ không được thấy dòng audit xuất kho');
      assert.deepEqual(leakedKeys(au.json), []);
    }
    const ownerAudit = await call('GET', `/api/work-orders/${woId}/audit`, owner);
    assert.ok(ownerAudit.json.some((e: any) => e.action === 'issue'));
  });

  it('4. nhà đầu tư chỉ xem; dashboard chặn cố vấn', async () => {
    assert.equal((await call('GET', `/api/work-orders/${woId}`, investor)).status, 200);
    assert.equal((await call('POST', `/api/work-orders/${woId}/reopen`, investor, { reason: 'thử' })).status, 403);
    const d = await call('GET', `/api/dashboard/daily?from=2026-11-01&to=2026-11-30`, investor);
    assert.equal(d.status, 200);
    assert.ok(Array.isArray(d.json));
    assert.equal((await call('GET', `/api/dashboard/daily?from=2026-11-01&to=2026-11-30`, advisor)).status, 403);
  });

  it('5. người của chi nhánh khác không đọc, không ghi được lệnh', async () => {
    const other = await newBranch(db);
    const outsider = await seedUser(db, other.branchId, ['owner'], 'khac');
    assert.equal((await call('GET', `/api/work-orders/${woId}`, outsider)).status, 404);
    assert.equal((await call('POST', `/api/work-orders/${woId}/cancel`, outsider,
      { expected_version: 1, paid_action: null, reason_code: 'TEST_X', reason: 'thử' })).status, 404);
  });

  it('6. kiểm đầu vào: số âm, thiếu idempotency key, dòng phụ tùng thiếu mã', async () => {
    const r = await call('POST', '/api/work-orders', advisor, { vehicle_id: b.vehicleId });
    const id = r.json.id;
    assert.equal((await call('POST', `/api/work-orders/${id}/lines`, advisor,
      { expected_version: 1, lines: [{ line_type: 'labor', description: 'x', qty_m: -1, unit_price_vnd: 1 }] })).status, 400);
    assert.equal((await call('POST', `/api/work-orders/${id}/lines`, advisor,
      { expected_version: 1, lines: [{ line_type: 'part', description: 'x', qty_m: 1000, unit_price_vnd: 1 }] })).status, 400);
    assert.equal((await call('POST', '/api/work-orders', advisor, { vehicle_id: b.vehicleId }, { 'idempotency-key': '' })).status, 400);
  });

  it('7. thợ chỉ chuyển sang đang sửa / chờ kiểm tra', async () => {
    const r = await call('POST', '/api/work-orders', advisor, { vehicle_id: b.vehicleId });
    const id = r.json.id;
    assert.equal((await call('POST', `/api/work-orders/${id}/transition`, tech, { expected_version: 1, to: 'approved' })).status, 403);
    await call('POST', `/api/work-orders/${id}/transition`, advisor, { expected_version: 1, to: 'approved' });
    assert.equal((await call('POST', `/api/work-orders/${id}/transition`, tech, { expected_version: 2, to: 'in_progress' })).status, 200);
  });

  it('8. webhook: sai chữ ký 401; không có mã đối chiếu thì lưu chờ ghép tay', async () => {
    const raw = JSON.stringify({ txn_id: `T-${uuidv7()}`, amount_vnd: 123_000, memo: 'chuyen tien', txn_at: NOW });
    assert.equal((await app.request('/webhooks/bank/bank-x', { method: 'POST', body: raw, headers: { 'x-signature': '00'.repeat(32) } }, env)).status, 401);
    const ok = await app.request('/webhooks/bank/bank-x', { method: 'POST', body: raw, headers: { 'x-signature': await sign(raw) } }, env);
    assert.deepEqual(await ok.json(), { status: 'unmatched' });
  });

  it('9. tắt DEV_AUTH thì header email bị bỏ qua; JWT rác bị từ chối', async () => {
    const prod = client({ DB: db, ACCESS_TEAM_DOMAIN: 'gara24.cloudflareaccess.com', ACCESS_AUD: 'aud-x' });
    assert.equal((await prod('GET', `/api/work-orders/${woId}`, owner)).status, 401);
    assert.equal((await prod('GET', `/api/work-orders/${woId}`, null, undefined, { 'cf-access-jwt-assertion': 'a.b.c' })).status, 401);
  });
});

describe('Kiểm JWT của Cloudflare Access', () => {
  const team = 'gara24.cloudflareaccess.com', aud = 'aud-123';
  let keys: CryptoKeyPair, jwk: any;
  const b64u = (b: Uint8Array | string) => Buffer.from(b).toString('base64url');
  async function token(payload: Record<string, unknown>, kid = 'k1', k = keys.privateKey) {
    const h = b64u(JSON.stringify({ alg: 'RS256', kid })), p = b64u(JSON.stringify(payload));
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', k, new TextEncoder().encode(`${h}.${p}`)));
    return `${h}.${p}.${b64u(sig)}`;
  }
  const now = Date.UTC(2026, 10, 4);
  const good = { email: 'Chu@Gara24.test', aud: [aud], iss: `https://${team}`, exp: now / 1000 + 600 };
  const fetchJwks = async () => ({ keys: [{ ...jwk, kid: 'k1' }] });

  before(async () => {
    keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  });

  it('JWT hợp lệ trả email viết thường', async () => {
    _resetJwksCache();
    assert.deepEqual(await verifyAccessJwt(await token(good), { teamDomain: team, aud, now, fetchJwks }), { email: 'chu@gara24.test' });
  });

  it('sai aud, hết hạn, sai issuer, sai chữ ký đều bị từ chối', async () => {
    const opt = { teamDomain: team, aud, now, fetchJwks };
    await assert.rejects(verifyAccessJwt(await token({ ...good, aud: ['khac'] }), opt), /aud/);
    await assert.rejects(verifyAccessJwt(await token({ ...good, exp: now / 1000 - 1 }), opt), /expired/);
    await assert.rejects(verifyAccessJwt(await token({ ...good, iss: 'https://evil.cloudflareaccess.com' }), opt), /iss/);
    const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    await assert.rejects(verifyAccessJwt(await token(good, 'k1', other.privateKey), opt), /signature/);
    const t = await token(good), [h, , sg] = t.split('.');
    await assert.rejects(verifyAccessJwt(`${h}.${b64u(JSON.stringify({ ...good, email: 'attacker@x.test' }))}.${sg}`, opt), /signature/);
  });
});
