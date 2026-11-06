import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv7, runBatch } from '../src/lib.ts';
import { api } from '../src/api/routes.ts';
import type { Role } from '../src/api/auth.ts';
import { getDb, closeDb, newBranch, newItem, row, assertInvariants } from './helpers.ts';

after(closeDb);
const app = api();
const SECRET = 'whsec-test-secret';
const FORBIDDEN = /cost|profit|margin|stock_moves|value_vnd/i;
const leaked = (x: unknown, p = ''): string[] =>
  Array.isArray(x) ? x.flatMap((e, i) => leaked(e, `${p}[${i}]`))
  : x && typeof x === 'object' ? Object.entries(x).flatMap(([k, v]) => [...(FORBIDDEN.test(k) ? [`${p}.${k}`] : []), ...leaked(v, `${p}.${k}`)])
  : [];

async function seedUser(db: any, branchId: string, roles: Role[], name: string) {
  const id = uuidv7(), email = `${name}.${id.slice(-8)}@gara24.test`;
  await runBatch(db, [
    db.prepare(`INSERT INTO users(id, branch_id, full_name, email) VALUES (?, ?, ?, ?)`).bind(id, branchId, name, email),
    ...roles.map((r) => db.prepare(`INSERT INTO user_roles(user_id, branch_id, role, granted_by) VALUES (?, ?, ?, 'seed')`).bind(id, branchId, r)),
  ]);
  return email;
}

async function sign(raw: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('Thu tiền mặt và nhập kho qua API', () => {
  let db: any, env: any, b: Awaited<ReturnType<typeof newBranch>>;
  let owner: string, advisor: string, tech: string, store: string, cashier: string, item: string;
  const call = async (method: string, path: string, as: string | null, payload?: unknown, key: string = uuidv7()) => {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'idempotency-key': key };
    if (as) headers['x-dev-user-email'] = as;
    const res = await app.request(path, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) }, env);
    const t = await res.text();
    return { status: res.status, json: t ? JSON.parse(t) : null };
  };
  // Lệnh đã duyệt: công 500.000 + phụ tùng 2 x 200.000 = 900.000
  const approvedOrder = async () => {
    let r = await call('POST', '/api/work-orders', advisor, { vehicle_id: b.vehicleId });
    const id = r.json.id;
    r = await call('POST', `/api/work-orders/${id}/lines`, advisor, { expected_version: 1, lines: [
      { line_type: 'labor', description: 'Công', qty_m: 1000, unit_price_vnd: 500_000 },
      { line_type: 'part', item_id: item, description: 'Má phanh', qty_m: 2000, unit_price_vnd: 200_000 }] });
    r = await call('POST', `/api/work-orders/${id}/transition`, advisor, { expected_version: r.json.version, to: 'approved' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return id as string;
  };
  const cash = (woId: string, as: string, amount: number, key?: string) =>
    call('POST', `/api/work-orders/${woId}/payments/cash`, as, { amount_vnd: amount, note: 'khách trả tại quầy' }, key);

  before(async () => {
    db = await getDb();
    b = await newBranch(db);
    env = { DB: db, DEV_AUTH: '1', BANK_WEBHOOK_SECRET: SECRET, WEBHOOK_BRANCH_ID: b.branchId };
    [owner, advisor, tech, store, cashier] = await Promise.all([
      seedUser(db, b.branchId, ['owner'], 'chu'), seedUser(db, b.branchId, ['advisor'], 'covan'),
      seedUser(db, b.branchId, ['technician'], 'tho'), seedUser(db, b.branchId, ['storekeeper'], 'kho'),
      seedUser(db, b.branchId, ['cashier'], 'thungan'),
    ]);
    item = await newItem(db, b, 'MAPHANH');
    // cash.require_session mặc định bật: người thu tiền mặt phải có ca đang mở.
    for (const who of [cashier, owner]) assert.equal((await call('POST', '/api/cash-sessions', who, { denominations: {} })).status, 201);
  });

  it('1. thu một phần rồi thu đủ: phiếu PT, partial → paid, khóa lệnh, cộng cash_in_vnd và collected_vnd', async () => {
    const woId = await approvedOrder();
    let r = await cash(woId, cashier, 300_000);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.match(r.json.payment.doc_no, /^PT-\d{4}-\d{5}$/);
    assert.equal(r.json.payment.method, 'cash');
    assert.equal(r.json.order.payment_status, 'partial');
    assert.equal(r.json.order.paid_vnd, 300_000);
    assert.equal(r.json.order.locked_at, null);
    assert.deepEqual(leaked(r.json), [], 'thu ngân không thấy giá vốn');
    const day = r.json.payment.biz_date;

    assert.deepEqual((await cash(woId, cashier, 600_001)).json, { error: 'AMOUNT_EXCEEDS_DUE' });

    r = await cash(woId, cashier, 600_000);
    assert.equal(r.status, 201);
    assert.equal(r.json.order.payment_status, 'paid');
    assert.equal(typeof r.json.order.locked_at, 'number');
    assert.equal(r.json.order.lock_reason, 'paid');
    assert.deepEqual(r.json.order.events.at(-1), { ...r.json.order.events.at(-1), kind: 'lock', to_value: 'paid', by_name: 'thungan' });

    const again = await cash(woId, cashier, 1);
    assert.equal(again.status, 409);
    assert.equal(again.json.error, 'ORDER_NOT_PAYABLE');

    const s = await row(db, `SELECT collected_vnd, cash_in_vnd, qr_in_vnd FROM daily_branch_stats WHERE branch_id = ? AND biz_date = ?`, b.branchId, day);
    assert.deepEqual({ ...s }, { collected_vnd: 900_000, cash_in_vnd: 900_000, qr_in_vnd: 0 });
    const au = await call('GET', `/api/work-orders/${woId}/audit`, advisor);
    assert.equal(au.json.filter((e: any) => e.action === 'cash_in').length, 2);
    await assertInvariants(db, b.branchId);
  });

  it('2. gửi lặp cùng idempotency key trả lại đúng phiếu cũ, không thu hai lần', async () => {
    const woId = await approvedOrder();
    const key = uuidv7();
    const r1 = await cash(woId, cashier, 100_000, key);
    const r2 = await cash(woId, cashier, 100_000, key);
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 200);
    assert.equal(r2.json.payment.doc_no, r1.json.payment.doc_no);
    assert.equal(r2.json.order.paid_vnd, 100_000);
    assert.equal((await row(db, `SELECT COUNT(*) AS n FROM payments WHERE id IN (SELECT payment_id FROM payment_allocations WHERE work_order_id = ?)`, woId)).n, 1);
    await assertInvariants(db, b.branchId);
  });

  it('3. phân quyền: cố vấn, thợ, thủ kho không thu tiền mặt; chi nhánh khác 404; số tiền sai 400', async () => {
    const woId = await approvedOrder();
    for (const who of [advisor, tech, store]) assert.equal((await cash(woId, who, 1000)).status, 403);
    const other = await newBranch(db);
    const outsider = await seedUser(db, other.branchId, ['owner'], 'khac');
    assert.equal((await cash(woId, outsider, 1000)).status, 404);
    for (const amount of [0, -5, 1.5]) assert.equal((await cash(woId, cashier, amount)).status, 400);
    assert.equal((await cash(woId, owner, 1000)).status, 201);
  });

  it('4. thu tiền mặt hủy mã QR đang chờ; QR sau đó dùng chung dãy số PT; khách chuyển theo mã cũ thì chờ ghép tay', async () => {
    const woId = await approvedOrder();
    const old = await call('POST', `/api/work-orders/${woId}/payment-intents`, cashier);
    assert.equal(old.json.amount_vnd, 900_000);
    const c1 = await cash(woId, cashier, 400_000);
    assert.equal((await row(db, `SELECT status FROM payment_intents WHERE id = ?`, old.json.intent_id)).status, 'void');

    const late = JSON.stringify({ txn_id: `T-${uuidv7()}`, amount_vnd: 900_000, memo: `CK ${old.json.transfer_ref}`, txn_at: Date.now() });
    const wl = await app.request('/webhooks/bank/bank-x', { method: 'POST', body: late, headers: { 'x-signature': await sign(late) } }, env);
    assert.deepEqual(await wl.json(), { status: 'unmatched' });

    const fresh = await call('POST', `/api/work-orders/${woId}/payment-intents`, cashier);
    assert.equal(fresh.json.amount_vnd, 500_000);
    const raw = JSON.stringify({ txn_id: `T-${uuidv7()}`, amount_vnd: 500_000, memo: `CK ${fresh.json.transfer_ref}`, txn_at: Date.now() });
    const wh = await app.request('/webhooks/bank/bank-x', { method: 'POST', body: raw, headers: { 'x-signature': await sign(raw) } }, env);
    assert.deepEqual(await wh.json(), { status: 'matched' });
    const qrNo = (await row(db, `SELECT p.doc_no FROM payments p JOIN payment_allocations a ON a.payment_id = p.id WHERE a.work_order_id = ? AND p.method = 'qr'`, woId)).doc_no;
    assert.equal(Number(qrNo.slice(-5)), Number(c1.json.payment.doc_no.slice(-5)) + 1);
    const w = await call('GET', `/api/work-orders/${woId}`, owner);
    assert.equal(w.json.payment_status, 'paid');
    await assertInvariants(db, b.branchId);
  });

  it('5. hủy lệnh đã thu tiền mặt: chuyển thành tiền trả trước, bất biến vẫn đúng', async () => {
    const woId = await approvedOrder();
    await cash(woId, cashier, 200_000);
    const w = await call('GET', `/api/work-orders/${woId}`, owner);
    const r = await call('POST', `/api/work-orders/${woId}/cancel`, owner, { expected_version: w.json.version, paid_action: 'advance', reason_code: 'KHACH_DOI_Y', reason: 'khách không sửa nữa' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal((await cash(woId, cashier, 1000)).json.error, 'ORDER_NOT_PAYABLE');
    await assertInvariants(db, b.branchId);
  });

  it('6. nhập kho: thủ kho tạo phiếu NK có giá nhập; tồn tăng; cố vấn chỉ thấy số lượng', async () => {
    const before = (await call('GET', `/api/items?q=${encodeURIComponent(`${b.code}-MAPHANH`)}`, advisor)).json[0].on_hand_qty_m;
    const r = await call('POST', '/api/stock/receipts', store, { warehouse_id: b.warehouseId, supplier_invoice_no: 'HD-0001', note: 'nhập đầu tuần',
      lines: [{ item_id: item, qty_m: 5000, unit_cost_vnd: 120_000 }] });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.match(r.json.doc_no, /^NK-\d{4}-\d{5}$/);
    assert.equal(r.json.total_cost_vnd, 600_000);
    assert.deepEqual(r.json.lines, [{ item_id: item, qty_m: 5000, total_cost_vnd: 600_000 }]);
    assert.equal(r.json.supplier_invoice_no, 'HD-0001');

    const items = (await call('GET', `/api/items?q=${encodeURIComponent(`${b.code}-MAPHANH`)}`, advisor)).json;
    assert.equal(items[0].on_hand_qty_m, before + 5000);
    assert.deepEqual(leaked(items), []);
    const bal = await row(db, `SELECT last_unit_cost_vnd FROM stock_balances WHERE warehouse_id = ? AND item_id = ?`, b.warehouseId, item);
    assert.equal(bal.last_unit_cost_vnd, 120_000);
    await assertInvariants(db, b.branchId);
  });

  it('7. nhập kho: cố vấn, thợ, thu ngân bị 403; chủ và quản lý được', async () => {
    const payload = { warehouse_id: b.warehouseId, lines: [{ item_id: item, qty_m: 1000, unit_cost_vnd: 100_000 }] };
    for (const who of [advisor, tech, cashier]) {
      const r = await call('POST', '/api/stock/receipts', who, payload);
      assert.equal(r.status, 403);
      assert.deepEqual(leaked(r.json), []);
    }
    assert.equal((await call('POST', '/api/stock/receipts', owner, payload)).status, 201);
    const me = await call('GET', '/api/me', advisor);
    assert.ok(!me.json.perms.includes('stock.receive') && !me.json.perms.includes('pay.cash'));
    assert.ok((await call('GET', '/api/me', store)).json.perms.includes('stock.receive'));
  });

  it('8. nhập kho: chặn mặt hàng dịch vụ, mặt hàng chi nhánh khác, kho chi nhánh khác; gửi lặp trả phiếu cũ', async () => {
    const labor = uuidv7();
    await runBatch(db, [db.prepare(`INSERT INTO items(id, branch_id, code, name, item_type, uom) VALUES (?, ?, ?, 'Công', 'labor', 'giờ')`).bind(labor, b.branchId, `${b.code}-CONG`)]);
    let r = await call('POST', '/api/stock/receipts', store, { warehouse_id: b.warehouseId, lines: [{ item_id: labor, qty_m: 1000, unit_cost_vnd: 1 }] });
    assert.deepEqual([r.status, r.json], [409, { error: 'ITEM_NOT_STOCKABLE' }]);

    const other = await newBranch(db);
    const foreign = await newItem(db, other, 'LOC');
    r = await call('POST', '/api/stock/receipts', store, { warehouse_id: b.warehouseId, lines: [{ item_id: foreign, qty_m: 1000, unit_cost_vnd: 1 }] });
    assert.equal(r.json.error, 'ITEM_NOT_STOCKABLE');
    r = await call('POST', '/api/stock/receipts', store, { warehouse_id: other.warehouseId, lines: [{ item_id: item, qty_m: 1000, unit_cost_vnd: 1 }] });
    assert.deepEqual([r.status, r.json], [404, { error: 'warehouse_not_found' }]);
    r = await call('POST', '/api/stock/receipts', store, { warehouse_id: b.warehouseId, lines: [{ item_id: item, qty_m: 1000, unit_cost_vnd: -1 }] });
    assert.equal(r.status, 400);

    const key = uuidv7(), payload = { warehouse_id: b.warehouseId, lines: [{ item_id: item, qty_m: 2000, unit_cost_vnd: 110_000 }] };
    const r1 = await call('POST', '/api/stock/receipts', store, payload, key);
    const r2 = await call('POST', '/api/stock/receipts', store, payload, key);
    assert.deepEqual([r1.status, r2.status], [201, 200]);
    assert.equal(r2.json.doc_no, r1.json.doc_no);
    await assertInvariants(db, b.branchId);
  });

  it('9. nhập vào kho thứ hai chưa có dòng tồn: tự tạo dòng tồn', async () => {
    const wh2 = uuidv7();
    await runBatch(db, [db.prepare(`INSERT INTO warehouses(id, branch_id, code) VALUES (?, ?, 'KHO2')`).bind(wh2, b.branchId)]);
    const r = await call('POST', '/api/stock/receipts', store, { warehouse_id: wh2, lines: [{ item_id: item, qty_m: 3000, unit_cost_vnd: 90_000 }] });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const bal = await row(db, `SELECT on_hand_qty_m, on_hand_value_vnd, allow_negative FROM stock_balances WHERE warehouse_id = ? AND item_id = ?`, wh2, item);
    assert.deepEqual({ ...bal }, { on_hand_qty_m: 3000, on_hand_value_vnd: 270_000, allow_negative: 0 });
    await assertInvariants(db, b.branchId);
  });
});
