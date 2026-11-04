import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv7 } from '../src/lib.ts';
import { api } from '../src/api/routes.ts';
import { DEMO_BRANCH } from '../src/api/dev.ts';
import { getDb, closeDb, assertInvariants } from './helpers.ts';

after(closeDb);
const app = api();
const FORBIDDEN = /cost|profit|margin|stock_moves|value_vnd/i;
const leaked = (x: unknown, p = ''): string[] =>
  Array.isArray(x) ? x.flatMap((e, i) => leaked(e, `${p}[${i}]`))
  : x && typeof x === 'object' ? Object.entries(x).flatMap(([k, v]) => [...(FORBIDDEN.test(k) ? [`${p}.${k}`] : []), ...leaked(v, `${p}.${k}`)])
  : [];

describe('API phục vụ giao diện', () => {
  let env: any;
  const call = async (method: string, path: string, as: string | null, body?: unknown, e = env) => {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'idempotency-key': uuidv7() };
    if (as) headers['x-dev-user-email'] = as;
    const r = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, e);
    const t = await r.text();
    return { status: r.status, json: t ? JSON.parse(t) : null };
  };
  const ADV = 'covan@demo.gara24', OWNER = 'chu@demo.gara24', TECH = 'tho.tuan@demo.gara24';

  before(async () => {
    env = { DB: await getDb(), DEV_AUTH: '1' };
  });

  it('route /dev tắt khi không bật DEV_AUTH, và tắt khi đã cấu hình Access', async () => {
    const db = env.DB;
    assert.equal((await call('POST', '/dev/seed', null, undefined, { DB: db })).status, 404);
    assert.equal((await call('POST', '/dev/seed', null, undefined, { DB: db, DEV_AUTH: '1', ACCESS_TEAM_DOMAIN: 'x.cloudflareaccess.com' })).status, 404);
  });

  it('nạp dữ liệu mẫu một lần, gọi lại không nạp trùng', async () => {
    assert.deepEqual((await call('POST', '/dev/seed', null)).json, { seeded: true, branch_id: DEMO_BRANCH });
    assert.deepEqual((await call('POST', '/dev/seed', null)).json, { seeded: false, branch_id: DEMO_BRANCH });
    const users = (await call('GET', '/dev/users', null)).json;
    assert.equal(users.length, 9);
    await assertInvariants(env.DB, DEMO_BRANCH);
  });

  it('/api/me trả vai và quyền; cố vấn không thấy giá vốn', async () => {
    const me = (await call('GET', '/api/me', ADV)).json;
    assert.equal(me.sees_cost, false);
    assert.ok(me.perms.includes('wo.create') && !me.perms.includes('wo.issue'));
    assert.equal(me.branch_name, 'Gara Quận 7');
    assert.equal((await call('GET', '/api/me', OWNER)).json.sees_cost, true);
  });

  it('bảng điều phối: chỉ lệnh đang mở, có lý do chờ, không lộ giá vốn', async () => {
    const r = await call('GET', '/api/work-orders', ADV);
    assert.equal(r.status, 200);
    assert.equal(r.json.length, 5);
    assert.deepEqual(leaked(r.json), []);
    assert.equal(r.json.filter((o: any) => o.hold_reason === 'parts').length, 1);
    assert.equal((await call('GET', '/api/work-orders?scope=all', ADV)).json.length, 6);
  });

  it('danh mục phụ tùng có số tồn nhưng không có giá trị tồn', async () => {
    const items = (await call('GET', '/api/items?q=phanh', TECH)).json;
    assert.equal(items.length, 2);
    assert.deepEqual(leaked(items), []);
    assert.ok(items.every((i: any) => typeof i.on_hand_qty_m === 'number'));
  });

  it('tìm xe theo biển, thêm xe; biển trùng bị từ chối', async () => {
    assert.equal((await call('GET', '/api/vehicles?q=51h-123', ADV)).json[0].plate, '51H-123.45');
    const created = await call('POST', '/api/vehicles', ADV, { plate: '51F-999.88', make: 'Kia', model: 'Morning' });
    assert.equal(created.status, 201);
    assert.equal((await call('POST', '/api/vehicles', ADV, { plate: '51f 99988' })).json.error, 'PLATE_EXISTS');
    assert.equal((await call('POST', '/api/vehicles', TECH, { plate: '51F-111.22' })).status, 403);
  });

  it('khoảng chờ: mở, không mở trùng, đóng', async () => {
    const list = (await call('GET', '/api/work-orders', ADV)).json;
    const o = list.find((x: any) => x.status === 'in_progress' && !x.hold_reason);
    let r = await call('POST', `/api/work-orders/${o.id}/holds`, TECH, { reason: 'customer_approval', note: 'Chờ khách duyệt thay đĩa' });
    assert.equal(r.status, 200);
    assert.equal(r.json.hold.reason, 'customer_approval');
    assert.equal((await call('POST', `/api/work-orders/${o.id}/holds`, TECH, { reason: 'parts' })).json.error, 'HOLD_ALREADY_OPEN');
    r = await call('POST', `/api/work-orders/${o.id}/holds/end`, TECH);
    assert.equal(r.json.hold, null);
    assert.equal((await call('POST', `/api/work-orders/${o.id}/holds/end`, TECH)).json.error, 'NO_OPEN_HOLD');
  });

  it('giả lập ngân hàng báo tiền: lệnh thu đủ và khóa', async () => {
    const list = (await call('GET', '/api/work-orders', ADV)).json;
    const o = list.find((x: any) => x.grand_total_vnd > 0 && x.status === 'in_progress');
    const intent = (await call('POST', `/api/work-orders/${o.id}/payment-intents`, 'thungan@demo.gara24')).json;
    assert.deepEqual((await call('POST', '/dev/simulate-bank', null, { intent_id: intent.intent_id })).json, { status: 'matched' });
    const after = (await call('GET', `/api/work-orders/${o.id}`, OWNER)).json;
    assert.equal(after.payment_status, 'paid');
    assert.equal(typeof after.locked_at, 'number');
    await assertInvariants(env.DB, DEMO_BRANCH);
  });
});
