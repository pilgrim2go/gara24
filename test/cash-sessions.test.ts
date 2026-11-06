import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv7, runBatch } from '../src/lib.ts';
import { api } from '../src/api/routes.ts';
import type { Role } from '../src/api/auth.ts';
import { getDb, closeDb, newBranch, newItem, row, expectBizError, assertInvariants } from './helpers.ts';

after(closeDb);
const app = api();

async function seedUser(db: any, branchId: string, roles: Role[], name: string) {
  const id = uuidv7(), email = `${name}.${id.slice(-8)}@gara24.test`.toLowerCase();
  await runBatch(db, [
    db.prepare(`INSERT INTO users(id, branch_id, full_name, email) VALUES (?, ?, ?, ?)`).bind(id, branchId, name, email),
    ...roles.map((r) => db.prepare(`INSERT INTO user_roles(user_id, branch_id, role, granted_by) VALUES (?, ?, ?, 'seed')`).bind(id, branchId, r)),
  ]);
  return { id, email };
}

const setSetting = (db: any, branchId: string, key: string, value: unknown) =>
  runBatch(db, [db.prepare(`INSERT INTO settings(branch_id, key, value_json, effective_from, set_by, reason) VALUES (?, ?, ?, '2000-01-01', 'test', 'test')`)
    .bind(branchId, key, JSON.stringify(value))]);

// Mỗi khối test một chi nhánh mới để setting và ca không lẫn nhau.
async function setup() {
  const db: any = await getDb();
  const b = await newBranch(db);
  const env = { DB: db, DEV_AUTH: '1' };
  const [owner, manager, advisor, tech, cashA, cashB, acct] = await Promise.all([
    seedUser(db, b.branchId, ['owner'], 'chu'), seedUser(db, b.branchId, ['manager'], 'quanly'),
    seedUser(db, b.branchId, ['advisor'], 'covan'), seedUser(db, b.branchId, ['technician'], 'tho'),
    seedUser(db, b.branchId, ['cashier'], 'thunganA'), seedUser(db, b.branchId, ['cashier'], 'thunganB'),
    seedUser(db, b.branchId, ['accountant'], 'ketoan'),
  ]);
  const item = await newItem(db, b, 'LOC');
  const call = async (method: string, path: string, as: { email: string } | null, payload?: unknown, key: string = uuidv7()) => {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'idempotency-key': key };
    if (as) headers['x-dev-user-email'] = as.email;
    const res = await app.request(path, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) }, env);
    const t = await res.text();
    return { status: res.status, json: t ? JSON.parse(t) : null };
  };
  // Lệnh đã duyệt, tổng 900.000 (công 500.000 + 2 x 200.000)
  const approvedOrder = async () => {
    let r = await call('POST', '/api/work-orders', advisor, { vehicle_id: b.vehicleId });
    const id = r.json.id;
    r = await call('POST', `/api/work-orders/${id}/lines`, advisor, { expected_version: 1, lines: [
      { line_type: 'labor', description: 'Công', qty_m: 1000, unit_price_vnd: 500_000 },
      { line_type: 'part', item_id: item, description: 'Lọc', qty_m: 2000, unit_price_vnd: 200_000 }] });
    r = await call('POST', `/api/work-orders/${id}/transition`, advisor, { expected_version: r.json.version, to: 'approved' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return id as string;
  };
  const open = (as: { email: string }, denominations: Record<string, number>, key?: string) => call('POST', '/api/cash-sessions', as, { denominations }, key);
  const close = (as: { email: string }, id: string, denominations: Record<string, number>, variance_reason?: string) =>
    call('POST', `/api/cash-sessions/${id}/close`, as, { denominations, ...(variance_reason ? { variance_reason } : {}) });
  const cash = (woId: string, as: { email: string }, amount: number) => call('POST', `/api/work-orders/${woId}/payments/cash`, as, { amount_vnd: amount });
  return { db, b, call, approvedOrder, open, close, cash, owner, manager, advisor, tech, cashA, cashB, acct };
}

describe('Ca thu ngân (cash_sessions)', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  before(async () => { t = await setup(); });

  it('1. mở ca theo mệnh giá: quỹ đầu ca = tổng tờ x mệnh giá; mở lần hai bị chặn; gửi lặp trả lại ca cũ; mệnh giá lạ 400', async () => {
    const key = uuidv7();
    const r = await t.open(t.cashA, { '500000': 1, '100000': 3, '10000': 5, '500': 2 }, key);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.opening_float_vnd, 851_000);
    assert.deepEqual(r.json.opening_denominations, { '500000': 1, '100000': 3, '10000': 5, '500': 2 });
    assert.equal(r.json.status, 'open');
    assert.equal(r.json.expected_vnd, 851_000);
    assert.equal(r.json.holder_name, 'thunganA');
    assert.match(r.json.biz_date, /^\d{4}-\d{2}-\d{2}$/);
    const again = await t.open(t.cashA, { '500000': 1, '100000': 3, '10000': 5, '500': 2 }, key);
    assert.deepEqual([again.status, again.json.id], [200, r.json.id]);
    assert.deepEqual((await t.open(t.cashA, {})).json, { error: 'SESSION_ALREADY_OPEN' });
    for (const bad of [{ '300000': 1 }, { '100000': -1 }, { '100000': 1.5 }, { abc: 1 }]) assert.equal((await t.open(t.cashB, bad)).status, 400);
    for (const who of [t.advisor, t.tech, t.acct]) assert.equal((await t.open(who, {})).status, 403);
    await assertInvariants(t.db, t.b.branchId);
  });

  it('2. cash.require_session mặc định bật: chưa mở ca không thu được; mở ca rồi thì phiếu PT gắn vào ca', async () => {
    const woId = await t.approvedOrder();
    const none = await t.cash(woId, t.cashB, 100_000);
    assert.deepEqual([none.status, none.json], [409, { error: 'NO_OPEN_SESSION' }]);
    let cur = await t.call('GET', '/api/cash-sessions/current', t.cashB);
    assert.deepEqual(cur.json, { require_session: true, session: null });

    const s = (await t.open(t.cashB, { '50000': 2 })).json;
    const p = await t.cash(woId, t.cashB, 300_000);
    assert.equal(p.status, 201, JSON.stringify(p.json));
    assert.equal(p.json.payment.cash_session_id, s.id);
    cur = await t.call('GET', '/api/cash-sessions/current', t.cashB);
    assert.deepEqual([cur.json.session.id, cur.json.session.cash_in_vnd, cur.json.session.expected_vnd, cur.json.session.payment_count], [s.id, 300_000, 400_000, 1]);
    const d = await t.call('GET', `/api/cash-sessions/${s.id}`, t.cashB);
    assert.equal(d.json.payments.length, 1);
    assert.equal(d.json.payments[0].doc_no, p.json.payment.doc_no);
    assert.match(d.json.payments[0].order_no, /^RO-/);
    await assertInvariants(t.db, t.b.branchId);
  });

  it('3. chốt ca đếm khớp: chênh lệch 0, không cần lý do; sau chốt không thu được, ca đã chốt không sửa được', async () => {
    const cur = (await t.call('GET', '/api/cash-sessions/current', t.cashB)).json.session;   // quỹ 100.000 + thu 300.000
    const r = await t.close(t.cashB, cur.id, { '200000': 2 });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual([r.json.status, r.json.expected_vnd, r.json.counted_vnd, r.json.variance_vnd, r.json.variance_reason, r.json.closed_by_name],
      ['closed', 400_000, 400_000, 0, null, 'thunganB']);
    assert.deepEqual((await t.close(t.cashB, cur.id, { '200000': 2 })).json, { error: 'SESSION_NOT_OPEN' });
    const woId = await t.approvedOrder();
    assert.equal((await t.cash(woId, t.cashB, 1000)).json.error, 'NO_OPEN_SESSION');

    await expectBizError(runBatch(t.db, [t.db.prepare(`UPDATE cash_sessions SET counted_vnd = 1 WHERE id = ?`).bind(cur.id)]), 'SESSION_CLOSED');
    await expectBizError(runBatch(t.db, [t.db.prepare(`INSERT INTO payments(id, branch_id, doc_no, direction, method, amount_vnd, biz_date, at, status, cash_session_id)
      VALUES (?, ?, 'X-1', 'in', 'cash', 1000, '2026-11-04', 0, 'posted', ?)`).bind(uuidv7(), t.b.branchId, cur.id)]), 'SESSION_CLOSED');
    await expectBizError(runBatch(t.db, [t.db.prepare(`UPDATE payments SET amount_vnd = 1 WHERE cash_session_id = ?`).bind(cur.id)]), 'SESSION_LOCKED');
    await expectBizError(runBatch(t.db, [t.db.prepare(`DELETE FROM cash_sessions WHERE id = ?`).bind(cur.id)]), 'NO_DELETE');
    await assertInvariants(t.db, t.b.branchId);
  });

  it('4. chênh lệch vượt ngưỡng (mặc định 0) phải có lý do; có lý do thì chốt, lưu lý do và ghi nhật ký', async () => {
    const s = (await t.open(t.cashB, { '100000': 2 })).json;
    const woId = await t.approvedOrder();
    await t.cash(woId, t.cashB, 150_000);                                 // dự kiến 350.000
    const noReason = await t.close(t.cashB, s.id, { '100000': 3, '20000': 2 });   // đếm 340.000, thiếu 10.000
    assert.deepEqual([noReason.status, noReason.json], [409, { error: 'VARIANCE_REASON_REQUIRED' }]);
    assert.equal((await t.close(t.cashB, s.id, { '100000': 3, '20000': 2 }, 'x')).status, 400, 'lý do quá ngắn');
    const r = await t.close(t.cashB, s.id, { '100000': 3, '20000': 2 }, 'Thối nhầm cho khách 10.000');
    assert.deepEqual([r.status, r.json.expected_vnd, r.json.counted_vnd, r.json.variance_vnd, r.json.variance_reason],
      [200, 350_000, 340_000, -10_000, 'Thối nhầm cho khách 10.000']);
    const au = await row(t.db, `SELECT action, reason FROM audit_log WHERE entity = 'cash_session' AND entity_id = ? AND action = 'close'`, s.id);
    assert.equal(au.reason, 'Thối nhầm cho khách 10.000');
    await assertInvariants(t.db, t.b.branchId);
  });

  it('5. ngưỡng chênh lệch đổi bằng setting: lệch trong ngưỡng không cần lý do, vượt ngưỡng vẫn bắt buộc', async () => {
    const x = await setup();
    await setSetting(x.db, x.b.branchId, 'cash.variance_reason_threshold_vnd', 20_000);
    let s = (await x.open(x.cashA, { '100000': 1 })).json;
    let r = await x.close(x.cashA, s.id, { '50000': 1, '20000': 1, '10000': 1 });    // thiếu 20.000 = ngưỡng
    assert.deepEqual([r.status, r.json.variance_vnd], [200, -20_000]);
    s = (await x.open(x.cashA, { '100000': 1 })).json;
    r = await x.close(x.cashA, s.id, { '100000': 1, '20000': 1, '1000': 1 });          // thừa 21.000
    assert.equal(r.json.error, 'VARIANCE_REASON_REQUIRED');
    r = await x.close(x.cashA, s.id, { '100000': 1, '20000': 1, '1000': 1 }, 'Khách gửi lại tiền thừa hôm qua');
    assert.deepEqual([r.status, r.json.variance_vnd], [200, 21_000]);
    await assertInvariants(x.db, x.b.branchId);
  });

  it('6. phân quyền xem: quản lý, chủ, kế toán thấy mọi ca; thu ngân chỉ ca của mình; cố vấn, thợ 403', async () => {
    const x = await setup();
    const a = (await x.open(x.cashA, { '100000': 1 })).json;
    const bb = (await x.open(x.cashB, { '200000': 1 })).json;
    const ids = async (who: any, q = '') => (await x.call('GET', `/api/cash-sessions${q}`, who)).json.map((s: any) => s.id).sort();
    assert.deepEqual(await ids(x.cashA), [a.id]);
    assert.deepEqual(await ids(x.cashB), [bb.id]);
    for (const who of [x.manager, x.owner, x.acct]) assert.deepEqual(await ids(who), [a.id, bb.id].sort());
    assert.deepEqual(await ids(x.manager, '?status=closed'), []);
    assert.equal((await x.call('GET', '/api/cash-sessions?status=xyz', x.manager)).status, 400);
    assert.equal((await x.call('GET', `/api/cash-sessions/${bb.id}`, x.cashA)).status, 404);
    assert.equal((await x.call('GET', `/api/cash-sessions/${bb.id}`, x.acct)).status, 200);
    for (const who of [x.advisor, x.tech]) {
      assert.equal((await x.call('GET', '/api/cash-sessions', who)).status, 403);
      assert.equal((await x.call('GET', `/api/cash-sessions/${a.id}`, who)).status, 403);
    }
    const other = await setup();
    assert.equal((await other.call('GET', `/api/cash-sessions/${a.id}`, other.manager)).status, 404, 'chi nhánh khác');
    const me = await x.call('GET', '/api/me', x.cashA);
    assert.ok(me.json.perms.includes('cash.session') && !me.json.perms.includes('cash.session.all'));
    await assertInvariants(x.db, x.b.branchId);
  });

  it('7. chốt hộ: thu ngân không chốt ca người khác (404); kế toán chỉ xem (403); quản lý chốt hộ được, ghi người chốt', async () => {
    const x = await setup();
    const s = (await x.open(x.cashA, { '100000': 1 })).json;
    assert.equal((await x.close(x.cashB, s.id, { '100000': 1 })).status, 404);
    assert.equal((await x.close(x.acct, s.id, { '100000': 1 })).status, 403);
    const r = await x.close(x.manager, s.id, { '100000': 1 });
    assert.deepEqual([r.status, r.json.closed_by, r.json.closed_by_name, r.json.holder_name], [200, x.manager.id, 'quanly', 'thunganA']);
    await assertInvariants(x.db, x.b.branchId);
  });

  it('8. tắt cash.require_session: thu tiền mặt không cần ca (phiếu không gắn ca); có ca đang mở thì vẫn gắn', async () => {
    const x = await setup();
    await setSetting(x.db, x.b.branchId, 'cash.require_session', false);
    assert.equal((await x.call('GET', '/api/cash-sessions/current', x.cashA)).json.require_session, false);
    const woId = await x.approvedOrder();
    let p = await x.cash(woId, x.cashA, 100_000);
    assert.deepEqual([p.status, p.json.payment.cash_session_id], [201, null]);
    const s = (await x.open(x.cashA, {})).json;
    p = await x.cash(woId, x.cashA, 100_000);
    assert.equal(p.json.payment.cash_session_id, s.id);
    await assertInvariants(x.db, x.b.branchId);
  });

  it('9. hủy lệnh hoàn tiền: phiếu chi PC gắn ca người hủy, giảm số dự kiến; chi quá tiền trong két bị chặn', async () => {
    const x = await setup();
    const woId = await x.approvedOrder();
    const sc = (await x.open(x.cashA, {})).json;
    await x.cash(woId, x.cashA, 300_000);
    const cancel = async () => {
      const w = await x.call('GET', `/api/work-orders/${woId}`, x.owner);
      return x.call('POST', `/api/work-orders/${woId}/cancel`, x.owner, { expected_version: w.json.version, paid_action: 'refund', reason_code: 'KHACH_DOI_Y', reason: 'khách không sửa nữa' });
    };
    assert.equal((await cancel()).json.error, 'NO_OPEN_SESSION', 'chủ chưa mở ca');
    const so = (await x.open(x.owner, { '100000': 2 })).json;
    assert.equal((await cancel()).json.error, 'SESSION_CASH_SHORT', 'két chủ 200.000 < 300.000');
    await x.close(x.owner, so.id, { '100000': 2 });
    const so2 = (await x.open(x.owner, { '500000': 1 })).json;
    const r = await cancel();
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const d = (await x.call('GET', `/api/cash-sessions/${so2.id}`, x.owner)).json;
    assert.deepEqual([d.cash_out_vnd, d.expected_vnd, d.payments[0].direction, d.payments[0].amount_vnd], [300_000, 200_000, 'out', 300_000]);
    assert.match(d.payments[0].doc_no, /^PC-/);
    const c = await x.close(x.owner, so2.id, { '100000': 2 });
    assert.deepEqual([c.json.expected_vnd, c.json.variance_vnd], [200_000, 0]);
    assert.equal((await x.call('GET', `/api/cash-sessions/${sc.id}`, x.cashA)).json.expected_vnd, 300_000, 'ca thu ngân không đổi');
    await assertInvariants(x.db, x.b.branchId);
  });

  it('10. trigger giữ bất biến số dư: chốt ca bằng câu SQL ghi sai dự kiến hoặc chênh lệch bị chặn; phiếu QR không gắn ca', async () => {
    const x = await setup();
    const s = (await x.open(x.cashA, { '100000': 1 })).json;
    const upd = (exp: number, counted: number, variance: number) => runBatch(x.db, [x.db.prepare(`UPDATE cash_sessions SET status = 'closed', closed_at = 1,
      expected_vnd = ?, counted_vnd = ?, variance_vnd = ? WHERE id = ?`).bind(exp, counted, variance, s.id)]);
    await expectBizError(upd(90_000, 90_000, 0), 'SESSION_BALANCE');
    await expectBizError(upd(100_000, 90_000, 0), 'SESSION_BALANCE');
    await expectBizError(runBatch(x.db, [x.db.prepare(`UPDATE cash_sessions SET opening_float_vnd = 5 WHERE id = ?`).bind(s.id)]), 'SESSION_LOCKED');
    await expectBizError(runBatch(x.db, [x.db.prepare(`INSERT INTO payments(id, branch_id, doc_no, direction, method, amount_vnd, biz_date, at, status, cash_session_id)
      VALUES (?, ?, 'X-2', 'in', 'qr', 1000, '2026-11-04', ?, 'posted', ?)`).bind(uuidv7(), x.b.branchId, Date.now(), s.id)]), 'SESSION_MISMATCH');
    const other = await setup();
    await expectBizError(runBatch(x.db, [x.db.prepare(`INSERT INTO payments(id, branch_id, doc_no, direction, method, amount_vnd, biz_date, at, status, cash_session_id)
      VALUES (?, ?, 'X-3', 'in', 'cash', 1000, '2026-11-04', ?, 'posted', ?)`).bind(uuidv7(), other.b.branchId, Date.now(), s.id)]), 'SESSION_MISMATCH');
    await assertInvariants(x.db, x.b.branchId);
  });
});
