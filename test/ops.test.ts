import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv7, runBatch } from '../src/lib.ts';
import {
  createWorkOrder, addLines, transition, receiveStock, issueStock, cancelWorkOrder,
  createPaymentIntent, postQrPayment, recordUnmatchedBankTxn, reopenWorkOrder, openCashSession, closeCashSession,
} from '../src/ops.ts';
import { getDb, closeDb, NOW, newBranch, newItem, newOrder, version, row, expectBizError, assertInvariants } from './helpers.ts';

after(closeDb);

type B = Awaited<ReturnType<typeof newBranch>>;

async function receive(db: any, b: B, itemId: string, qty: number, unitCost: number, now = NOW) {
  await receiveStock(db, { key: uuidv7(), branchId: b.branchId, userId: b.userId, docId: uuidv7(), warehouseId: b.warehouseId,
    lines: [{ move_id: uuidv7(), item_id: itemId, qty_m: qty * 1000, unit_cost_vnd: unitCost }], now });
}

// Lệnh đã duyệt, có 1 dòng công 500.000 và 1 dòng phụ tùng qty x giá bán
async function approvedOrder(db: any, b: B, itemId: string, qty: number, price = 200_000) {
  const { woId, orderNo } = await newOrder(db, b);
  const partLineId = uuidv7();
  await addLines(db, { branchId: b.branchId, userId: b.userId, woId, expectedVersion: await version(db, woId), now: NOW, lines: [
    { id: uuidv7(), line_type: 'labor', description: 'Công thay má phanh', qty_m: 1000, unit_price_vnd: 500_000 },
    { id: partLineId, line_type: 'part', item_id: itemId, description: 'Má phanh', qty_m: qty * 1000, unit_price_vnd: price },
  ] });
  await transition(db, { branchId: b.branchId, userId: b.userId, woId, expectedVersion: await version(db, woId), to: 'approved', now: NOW });
  return { woId, orderNo, partLineId };
}

async function issue(db: any, b: B, woId: string, lineId: string, itemId: string, qty: number, key = uuidv7(), now = NOW) {
  return issueStock(db, { key, branchId: b.branchId, userId: b.userId, woId, docId: uuidv7(), warehouseId: b.warehouseId,
    lines: [{ move_id: uuidv7(), line_id: lineId, item_id: itemId, qty_m: qty * 1000 }], now });
}

async function payQr(db: any, b: B, woId: string, amount: number, opts: { txnId?: string; intentId?: string } = {}) {
  const intentId = opts.intentId ?? uuidv7();
  if (!opts.intentId) await createPaymentIntent(db, { branchId: b.branchId, woId, intentId, transferRef: `G24${intentId.slice(-10)}`, ttlMs: 15 * 60_000, now: NOW });
  return postQrPayment(db, { branchId: b.branchId, provider: 'bank-x', providerTxnId: opts.txnId ?? uuidv7(), amount, memo: 'G24',
    intentId, woId, bankTxnId: uuidv7(), paymentId: uuidv7(), now: NOW + 60_000 });
}

// ============================================================================
describe('A. Hạ tầng D1: batch, guard, trigger', () => {
  it('A1 guard hỏng giữa batch thì rollback cả các câu chạy trước nó', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    await expectBizError(runBatch(db, [
      db.prepare(`INSERT INTO sequences(branch_id, seq_key, last_value) VALUES (?, 'TEST', 1)`).bind(b.branchId),
      db.prepare(`INSERT INTO _guard(code) SELECT 'VERSION_CONFLICT' WHERE 1`),
    ]), 'VERSION_CONFLICT');
    const r = await row(db, `SELECT COUNT(*) n FROM sequences WHERE branch_id = ? AND seq_key = 'TEST'`, b.branchId);
    assert.equal(r.n, 0);
  });

  it('A2 mã guard lạ vẫn hủy batch', async () => {
    const db = await getDb();
    await expectBizError(runBatch(db, [db.prepare(`INSERT INTO _guard(code) VALUES ('KHONG_CO')`)]), 'UNKNOWN');
  });

  it('A3 audit_log chỉ ghi thêm; lệnh không xóa được', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const { woId } = await newOrder(db, b);
    await expectBizError(runBatch(db, [db.prepare(`UPDATE audit_log SET action = 'x' WHERE entity_id = ?`).bind(woId)]), 'APPEND_ONLY');
    await expectBizError(runBatch(db, [db.prepare(`DELETE FROM audit_log WHERE entity_id = ?`).bind(woId)]), 'APPEND_ONLY');
    await expectBizError(runBatch(db, [db.prepare(`DELETE FROM work_orders WHERE id = ?`).bind(woId)]), 'NO_DELETE');
  });
});

// ============================================================================
describe('B. 2.1 Cấp số lệnh', () => {
  it('B1 số tăng liên tục theo chi nhánh và năm', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const nos = [];
    for (let i = 0; i < 3; i++) nos.push((await newOrder(db, b)).orderNo);
    assert.deepEqual(nos, ['RO-2026-0001', 'RO-2026-0002', 'RO-2026-0003']);
    await assertInvariants(db, b.branchId);
  });

  it('B2 gửi lặp cùng key trả kết quả cũ, không cấp số mới', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const key = uuidv7(), woId = uuidv7();
    const first = await createWorkOrder(db, { key, branchId: b.branchId, userId: b.userId, woId, vehicleId: b.vehicleId, now: NOW });
    const again = await createWorkOrder(db, { key, branchId: b.branchId, userId: b.userId, woId, vehicleId: b.vehicleId, now: NOW });
    assert.deepEqual(first, { orderNo: 'RO-2026-0001' });
    assert.deepEqual(again, { replayed: true, resultRef: woId });
    assert.equal((await row(db, `SELECT last_value v FROM sequences WHERE branch_id = ?`, b.branchId)).v, 1);
  });

  it('B3 thiếu cấu hình chính sách khóa: không tạo lệnh, bộ đếm không nhảy', async () => {
    const db = await getDb();
    const b = await newBranch(db, { lockPolicy: null });
    await expectBizError(newOrder(db, b), 'SETTING_MISSING');
    assert.equal((await row(db, `SELECT COUNT(*) n FROM sequences WHERE branch_id = ?`, b.branchId)).n, 0);
  });

  it('B4 20 yêu cầu song song không trùng số, không lỗ số', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const all = await Promise.all(Array.from({ length: 20 }, () => newOrder(db, b)));
    const seqs = all.map((x) => Number(x.orderNo.slice(-4))).sort((x, y) => x - y);
    assert.deepEqual(seqs, Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('B5 năm trong số lệnh theo giờ Việt Nam', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const lateNye = Date.UTC(2026, 11, 31, 16, 30);   // 23:30 31/12/2026 giờ VN
    const newYear = Date.UTC(2026, 11, 31, 17, 30);   // 00:30 01/01/2027 giờ VN
    assert.equal((await newOrder(db, b, lateNye)).orderNo, 'RO-2026-0001');
    assert.equal((await newOrder(db, b, newYear)).orderNo, 'RO-2027-0001');
  });
});

// ============================================================================
describe('C. 2.2 Xuất kho theo lệnh, bình quân tức thời', () => {
  it('C1 giá vốn bình quân, số dư, số đã xuất trên dòng', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'MAPHANH');
    await receive(db, b, item, 10, 100_000);
    await receive(db, b, item, 10, 130_000);              // bình quân 115.000
    const { woId, partLineId } = await approvedOrder(db, b, item, 3);
    const r = (await issue(db, b, woId, partLineId, item, 3)) as { statements: number };
    const m = await row(db, `SELECT total_cost_vnd c, cost_status s FROM stock_moves WHERE work_order_line_id = ?`, partLineId);
    assert.deepEqual([m.c, m.s], [345_000, 'final']);
    const bal = await row(db, `SELECT on_hand_qty_m q, on_hand_value_vnd v FROM stock_balances WHERE item_id = ?`, item);
    assert.deepEqual([bal.q, bal.v], [17_000, 1_955_000]);
    assert.equal((await row(db, `SELECT issued_qty_m q FROM work_order_lines WHERE id = ?`, partLineId)).q, 3000);
    assert.equal((await row(db, `SELECT parts_cost_vnd c FROM work_order_costs WHERE work_order_id = ?`, woId)).c, 345_000);
    console.log(`    batch xuất kho: ${r.statements} câu`);
    await assertInvariants(db, b.branchId);
  });

  it('C2 xuất quá số lượng trên lệnh bị chặn', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'LOC');
    await receive(db, b, item, 10, 50_000);
    const { woId, partLineId } = await approvedOrder(db, b, item, 2);
    await expectBizError(issue(db, b, woId, partLineId, item, 3), 'ISSUE_EXCEEDS_LINE');
    await assertInvariants(db, b.branchId);
  });

  it('C3 xuất quá tồn: cả batch rollback, số phiếu không nhảy', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'DAU');
    await receive(db, b, item, 2, 80_000);
    const { woId, partLineId } = await approvedOrder(db, b, item, 5);
    await expectBizError(issue(db, b, woId, partLineId, item, 5), 'INSUFFICIENT_STOCK');
    assert.equal((await row(db, `SELECT COUNT(*) n FROM stock_docs WHERE work_order_id = ?`, woId)).n, 0);
    assert.equal((await row(db, `SELECT COUNT(*) n FROM sequences WHERE branch_id = ? AND seq_key LIKE 'XK-%'`, b.branchId)).n, 0);
    assert.equal((await row(db, `SELECT on_hand_qty_m q FROM stock_balances WHERE item_id = ?`, item)).q, 2000);
    await assertInvariants(db, b.branchId);
  });

  it('C4 lệnh chưa duyệt không xuất kho được', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'BUGI');
    await receive(db, b, item, 5, 40_000);
    const { woId } = await newOrder(db, b);
    const lineId = uuidv7();
    await addLines(db, { branchId: b.branchId, userId: b.userId, woId, expectedVersion: await version(db, woId), now: NOW,
      lines: [{ id: lineId, line_type: 'part', item_id: item, description: 'Bugi', qty_m: 4000, unit_price_vnd: 90_000 }] });
    await expectBizError(issue(db, b, woId, lineId, item, 4), 'ORDER_NOT_EDITABLE');
  });

  it('C5 xuất hết thì lấy trọn giá trị còn lại, không để dư lẻ', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'GIOANG');
    await receive(db, b, item, 7, 14_286);                 // giá trị 100.002, bình quân không chia hết
    const { woId, partLineId } = await approvedOrder(db, b, item, 7);
    await issue(db, b, woId, partLineId, item, 3);
    await issue(db, b, woId, partLineId, item, 4);
    const bal = await row(db, `SELECT on_hand_qty_m q, on_hand_value_vnd v FROM stock_balances WHERE item_id = ?`, item);
    assert.deepEqual([bal.q, bal.v], [0, 0]);
    assert.equal((await row(db, `SELECT parts_cost_vnd c FROM work_order_costs WHERE work_order_id = ?`, woId)).c, 100_002);
    await assertInvariants(db, b.branchId);
  });

  it('C6 phụ tùng cho phép tồn âm: giá vốn ghi tạm tính', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'ACQUY', true);
    await receive(db, b, item, 1, 50_000);
    const { woId, partLineId } = await approvedOrder(db, b, item, 3);
    await issue(db, b, woId, partLineId, item, 3);
    const m = await row(db, `SELECT total_cost_vnd c, cost_status s FROM stock_moves WHERE work_order_line_id = ?`, partLineId);
    assert.deepEqual([m.c, m.s], [150_000, 'provisional']);
    assert.equal((await row(db, `SELECT cost_status s FROM work_order_costs WHERE work_order_id = ?`, woId)).s, 'provisional');
    assert.equal((await row(db, `SELECT on_hand_qty_m q FROM stock_balances WHERE item_id = ?`, item)).q, -2000);
    await assertInvariants(db, b.branchId);
  });

  it('C7 gửi lặp phiếu xuất không trừ kho hai lần', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'LOCGIO');
    await receive(db, b, item, 5, 60_000);
    const { woId, partLineId } = await approvedOrder(db, b, item, 2);
    const key = uuidv7();
    await issue(db, b, woId, partLineId, item, 2, key);
    const again = await issue(db, b, woId, partLineId, item, 2, key);
    assert.equal((again as any).replayed, true);
    assert.equal((await row(db, `SELECT on_hand_qty_m q FROM stock_balances WHERE item_id = ?`, item)).q, 3000);
    await assertInvariants(db, b.branchId);
  });
});

// ============================================================================
describe('D. 2.3 Hủy lệnh, hoàn kho', () => {
  async function cancel(db: any, b: B, woId: string, paidAction: 'refund' | 'advance' | null = null, expectedVersion?: number) {
    return cancelWorkOrder(db, { key: uuidv7(), branchId: b.branchId, userId: b.userId, woId, expectedVersion: expectedVersion ?? await version(db, woId),
      paidAction, reasonCode: 'CUSTOMER_WITHDREW', reason: 'Khách đổi ý', returnDocId: uuidv7(), refundPaymentId: uuidv7(), now: NOW + 3600_000 });
  }

  it('D1 hoàn kho theo giá vốn gốc, dù bình quân đã đổi', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'BOM');
    await receive(db, b, item, 10, 100_000);
    const { woId, partLineId } = await approvedOrder(db, b, item, 3);
    await issue(db, b, woId, partLineId, item, 3);                     // 300.000
    await receive(db, b, item, 10, 160_000);                           // bình quân đổi
    await cancel(db, b, woId);
    const ret = await row(db, `SELECT qty_delta_m q, total_cost_vnd c FROM stock_moves m JOIN stock_docs d ON d.id = m.stock_doc_id
                               WHERE d.work_order_id = ? AND d.doc_type = 'order_return'`, woId);
    assert.deepEqual([ret.q, ret.c], [3000, 300_000]);
    const w = await row(db, `SELECT status, grand_total_vnd g FROM work_orders WHERE id = ?`, woId);
    assert.deepEqual([w.status, w.g], ['cancelled', 0]);
    assert.equal((await row(db, `SELECT on_hand_value_vnd v FROM stock_balances WHERE item_id = ?`, item)).v, 700_000 + 1_600_000 + 300_000);
    await assertInvariants(db, b.branchId);
  });

  it('D2 đã thu một phần: phải chọn cách xử lý; chọn hoàn tiền thì có phiếu chi', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'DAY');
    await receive(db, b, item, 5, 30_000);
    const { woId } = await approvedOrder(db, b, item, 1);
    await payQr(db, b, woId, 200_000);                                  // cọc 200.000
    await expectBizError(cancel(db, b, woId, null), 'PAID_NEEDS_ACTION');
    // Hoàn tiền mặt lấy từ két: phải có ca đang mở và đủ tiền.
    await expectBizError(cancel(db, b, woId, 'refund'), 'NO_OPEN_SESSION');
    const sessionId = uuidv7();
    await openCashSession(db, { key: uuidv7(), branchId: b.branchId, userId: b.userId, sessionId, denominations: { '100000': 1 }, now: NOW });
    await expectBizError(cancel(db, b, woId, 'refund'), 'SESSION_CASH_SHORT');
    const s2 = uuidv7();
    await closeCashSession(db, { key: uuidv7(), branchId: b.branchId, userId: b.userId, sessionId, denominations: { '100000': 1 }, now: NOW + 60_000 });
    await openCashSession(db, { key: uuidv7(), branchId: b.branchId, userId: b.userId, sessionId: s2, denominations: { '200000': 1 }, now: NOW + 120_000 });
    await cancel(db, b, woId, 'refund');
    const p = await row(db, `SELECT direction, amount_vnd a, doc_no, cash_session_id s FROM payments WHERE branch_id = ? AND direction = 'out'`, b.branchId);
    assert.deepEqual([p.direction, p.a, p.doc_no, p.s], ['out', 200_000, 'PC-2026-00001', s2]);
    await assertInvariants(db, b.branchId);
  });

  it('D3 chọn chuyển thành tiền trả trước', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'COI');
    await receive(db, b, item, 5, 30_000);
    const { woId } = await approvedOrder(db, b, item, 1);
    await payQr(db, b, woId, 150_000);
    await cancel(db, b, woId, 'advance');
    assert.equal((await row(db, `SELECT SUM(amount_vnd) s FROM payment_allocations WHERE branch_id = ? AND target = 'advance'`, b.branchId)).s, 150_000);
    assert.equal((await row(db, `SELECT COUNT(*) n FROM payments WHERE branch_id = ? AND direction = 'out'`, b.branchId)).n, 0);
    await assertInvariants(db, b.branchId);
  });

  it('D4 lệnh đã khóa hoặc đã có hóa đơn thì không hủy được', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'CAO');
    await receive(db, b, item, 5, 30_000);
    const locked = await approvedOrder(db, b, item, 1);
    await payQr(db, b, locked.woId, 700_000);                           // thu đủ → khóa
    await expectBizError(cancel(db, b, locked.woId), 'ORDER_NOT_CANCELLABLE');
    const invoiced = await approvedOrder(db, b, item, 1);
    await runBatch(db, [db.prepare(`INSERT INTO invoices(id, branch_id, work_order_id, status) VALUES (?, ?, ?, 'issued')`).bind(uuidv7(), b.branchId, invoiced.woId)]);
    await expectBizError(cancel(db, b, invoiced.woId), 'INVOICE_ISSUED');
  });

  it('D5 sai version (người khác vừa sửa) thì không hủy', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'KEP');
    const { woId } = await approvedOrder(db, b, item, 1);
    await expectBizError(cancel(db, b, woId, null, 1), 'ORDER_NOT_CANCELLABLE');
  });
});

// ============================================================================
describe('E. 2.4 Thu tiền QR và khóa lệnh', () => {
  it('E1 thu đủ thì khóa; trigger chặn mọi đường sửa, kể cả SQL trực tiếp', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'LOP');
    await receive(db, b, item, 5, 30_000);
    const { woId, partLineId } = await approvedOrder(db, b, item, 1);   // 500.000 + 200.000
    await payQr(db, b, woId, 700_000);
    const w = await row(db, `SELECT payment_status ps, locked_at l, lock_reason r FROM work_orders WHERE id = ?`, woId);
    assert.deepEqual([w.ps, w.r, typeof w.l], ['paid', 'paid', 'number']);
    assert.equal((await row(db, `SELECT COUNT(*) n FROM work_order_events WHERE work_order_id = ? AND kind = 'lock'`, woId)).n, 1);
    // qua API: guard chặn trước
    await expectBizError(addLines(db, { branchId: b.branchId, userId: b.userId, woId, expectedVersion: await version(db, woId), now: NOW,
      lines: [{ id: uuidv7(), line_type: 'labor', description: 'Thêm', qty_m: 1000, unit_price_vnd: 1 }] }), 'ORDER_NOT_EDITABLE');
    await expectBizError(issue(db, b, woId, partLineId, item, 1), 'ORDER_NOT_EDITABLE');
    // bỏ qua API: trigger vẫn chặn
    await expectBizError(runBatch(db, [db.prepare(`UPDATE work_order_lines SET unit_price_vnd = 1 WHERE work_order_id = ?`).bind(woId)]), 'ORDER_LOCKED');
    await expectBizError(runBatch(db, [db.prepare(`UPDATE work_orders SET grand_total_vnd = 1 WHERE id = ?`).bind(woId)]), 'ORDER_LOCKED');
    await expectBizError(runBatch(db, [db.prepare(`UPDATE work_orders SET locked_at = NULL, grand_total_vnd = 1 WHERE id = ?`).bind(woId)]), 'ORDER_LOCKED');
    await assertInvariants(db, b.branchId);
  });

  it('E2 webhook gửi lại không ghi tiền hai lần', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'GAT');
    const { woId } = await approvedOrder(db, b, item, 1);
    const intentId = uuidv7(); const txn1 = `TXN-${uuidv7()}`;
    await createPaymentIntent(db, { branchId: b.branchId, woId, intentId, transferRef: `G24${intentId.slice(-10)}`, ttlMs: 900_000, now: NOW });
    await payQr(db, b, woId, 300_000, { txnId: txn1, intentId });
    await expectBizError(payQr(db, b, woId, 300_000, { txnId: txn1, intentId }), 'DUPLICATE_BANK_TXN');
    assert.equal((await row(db, `SELECT paid_vnd p FROM work_orders WHERE id = ?`, woId)).p, 300_000);
    await assertInvariants(db, b.branchId);
  });

  it('E3 lệnh đổi tổng tiền sau khi tạo QR: không tự ghép, lưu giao dịch chờ ghép tay', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'CHOI');
    const { woId } = await approvedOrder(db, b, item, 1);
    const intentId = uuidv7(); const txnS = `TXN-${uuidv7()}`;
    await createPaymentIntent(db, { branchId: b.branchId, woId, intentId, transferRef: `G24${intentId.slice(-10)}`, ttlMs: 900_000, now: NOW });
    await addLines(db, { branchId: b.branchId, userId: b.userId, woId, expectedVersion: await version(db, woId), now: NOW,
      lines: [{ id: uuidv7(), line_type: 'labor', description: 'Phát sinh', qty_m: 1000, unit_price_vnd: 100_000 }] });
    await expectBizError(payQr(db, b, woId, 700_000, { txnId: txnS, intentId }), 'INTENT_STALE');
    await recordUnmatchedBankTxn(db, { branchId: b.branchId, provider: 'bank-x', providerTxnId: txnS, amount: 700_000, memo: 'G24', bankTxnId: uuidv7(), now: NOW });
    assert.equal((await row(db, `SELECT match_status s FROM bank_transactions WHERE provider_txn_id = ? AND branch_id = ?`, txnS, b.branchId)).s, 'unmatched');
    assert.equal((await row(db, `SELECT paid_vnd p FROM work_orders WHERE id = ?`, woId)).p, 0);
  });

  it('E4 chuyển dư thì phần dư thành tiền trả trước', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'NAP');
    const { woId } = await approvedOrder(db, b, item, 1);               // 700.000
    await payQr(db, b, woId, 750_000);
    assert.equal((await row(db, `SELECT paid_vnd p FROM work_orders WHERE id = ?`, woId)).p, 700_000);
    assert.equal((await row(db, `SELECT amount_vnd a FROM payment_allocations WHERE branch_id = ? AND target = 'advance'`, b.branchId)).a, 50_000);
    await assertInvariants(db, b.branchId);
  });

  it('E5 mở lại lệnh có lý do; đã có hóa đơn thì không mở', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'DEN');
    const { woId } = await approvedOrder(db, b, item, 1);
    await payQr(db, b, woId, 700_000);
    await reopenWorkOrder(db, { branchId: b.branchId, userId: b.userId, woId, reason: 'Sai giá phụ tùng', now: NOW + 7200_000 });
    const w = await row(db, `SELECT locked_at l, reopen_count c FROM work_orders WHERE id = ?`, woId);
    assert.deepEqual([w.l, w.c], [null, 1]);
    await runBatch(db, [db.prepare(`INSERT INTO invoices(id, branch_id, work_order_id, status) VALUES (?, ?, ?, 'issued')`).bind(uuidv7(), b.branchId, woId)]);
    await expectBizError(reopenWorkOrder(db, { branchId: b.branchId, userId: b.userId, woId, reason: 'x', now: NOW }), 'INVOICE_ISSUED');
  });

  it('E6 chính sách khóa chỉ theo hóa đơn: thu đủ chưa khóa', async () => {
    const db = await getDb();
    const b = await newBranch(db, { lockPolicy: 'invoice' });
    const item = await newItem(db, b, 'KINH');
    const { woId } = await approvedOrder(db, b, item, 1);
    await payQr(db, b, woId, 700_000);
    const w = await row(db, `SELECT payment_status ps, locked_at l FROM work_orders WHERE id = ?`, woId);
    assert.deepEqual([w.ps, w.l], ['paid', null]);
  });
});

// ============================================================================
describe('F. Khóa kỳ (G1-12)', () => {
  it('F1 kỳ đã khóa thì không ghi kho, không ghi thu chi', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'SON');
    await receive(db, b, item, 5, 30_000);
    const { woId, partLineId } = await approvedOrder(db, b, item, 1);
    await runBatch(db, [db.prepare(`INSERT INTO accounting_periods(branch_id, period, status) VALUES (?, '2026-11', 'closed')`).bind(b.branchId)]);
    await expectBizError(issue(db, b, woId, partLineId, item, 1), 'PERIOD_CLOSED');
    await expectBizError(payQr(db, b, woId, 100_000), 'PERIOD_CLOSED');
    await assertInvariants(db, b.branchId);
  });
});

// ============================================================================
describe('G. Ghi nhận lệnh hoàn thành vào daily_branch_stats', () => {
  const stats = (db: any, b: B, d: string) => row(db, `SELECT * FROM daily_branch_stats WHERE branch_id = ? AND biz_date = ?`, b.branchId, d);
  async function deliver(db: any, b: B, woId: string, at: number) {
    for (const to of ['in_progress', 'qc', 'delivered']) {
      await transition(db, { branchId: b.branchId, userId: b.userId, woId, expectedVersion: await version(db, woId), to, now: at });
    }
  }

  it('G1 giao xe: doanh thu, giá vốn ghi vào ngày hoàn thành (giờ VN), không phải ngày nhận', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'MAPHANH');
    await receive(db, b, item, 5, 120_000);
    const { woId, partLineId } = await approvedOrder(db, b, item, 2);      // công 500.000 + 2 x 200.000
    await issue(db, b, woId, partLineId, item, 2);                         // giá vốn 240.000
    const at = Date.UTC(2026, 10, 30, 16, 30);                             // 23:30 30/11 giờ VN = 16:30 UTC
    await deliver(db, b, woId, at);
    const w = await row(db, `SELECT completed_at, completed_biz_date, delivered_at FROM work_orders WHERE id = ?`, woId);
    assert.deepEqual([w.completed_at, w.completed_biz_date, w.delivered_at], [at, '2026-11-30', at]);
    const s = await stats(db, b, '2026-11-30');
    assert.deepEqual([s.orders_completed, s.rev_labor_completed_vnd, s.rev_parts_completed_vnd, s.discount_completed_vnd, s.cogs_completed_vnd, s.cogs_provisional_vnd],
      [1, 500_000, 400_000, 0, 240_000, 0]);
    assert.equal((await stats(db, b, '2026-11-04')).orders_completed, 0);  // ngày nhận lệnh không có doanh thu hoàn thành
    await assertInvariants(db, b.branchId);
  });

  it('G2 giao rồi đóng lệnh: không cộng lần hai; lệnh hủy không tính', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'LOC');
    await receive(db, b, item, 5, 50_000);
    const { woId } = await approvedOrder(db, b, item, 1);
    await deliver(db, b, woId, NOW);
    await transition(db, { branchId: b.branchId, userId: b.userId, woId, expectedVersion: await version(db, woId), to: 'closed', now: NOW + 86_400_000 });
    const c = await approvedOrder(db, b, item, 1);
    await cancelWorkOrder(db, { key: uuidv7(), branchId: b.branchId, userId: b.userId, woId: c.woId, expectedVersion: await version(db, c.woId),
      paidAction: null, reasonCode: 'KHACH_DOI_Y', reason: 'khách đổi ý', returnDocId: uuidv7(), refundPaymentId: uuidv7(), now: NOW });
    const s = await stats(db, b, '2026-11-04');
    assert.deepEqual([s.orders_completed, s.rev_labor_completed_vnd + s.rev_parts_completed_vnd], [1, 700_000]);
    assert.equal((await stats(db, b, '2026-11-05'))?.orders_completed ?? 0, 0);
    assert.equal(typeof (await row(db, `SELECT closed_at FROM work_orders WHERE id = ?`, woId)).closed_at, 'number');
    await assertInvariants(db, b.branchId);
  });

  it('G3 giá vốn tạm tính (xuất khi tồn âm) vẫn tính vào giá vốn, tách riêng phần tạm tính', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'NHOT', true);
    await receive(db, b, item, 1, 100_000);
    const { woId, partLineId } = await approvedOrder(db, b, item, 3);
    await issue(db, b, woId, partLineId, item, 3);                         // 1 cái có giá, 2 cái theo giá cuối: 300.000 tạm tính
    await deliver(db, b, woId, NOW);
    const s = await stats(db, b, '2026-11-04');
    assert.deepEqual([s.cogs_completed_vnd, s.cogs_provisional_vnd], [300_000, 300_000]);
    await assertInvariants(db, b.branchId);
  });

  it('G4 bất biến phát hiện số liệu hoàn thành bị sửa tay', async () => {
    const db = await getDb();
    const b = await newBranch(db);
    const item = await newItem(db, b, 'GAT');
    const { woId } = await approvedOrder(db, b, item, 1);
    await deliver(db, b, woId, NOW);
    await runBatch(db, [db.prepare(`UPDATE daily_branch_stats SET rev_labor_completed_vnd = rev_labor_completed_vnd + 1 WHERE branch_id = ?`).bind(b.branchId)]);
    const { checkInvariants } = await import('../src/invariants.ts');
    assert.ok((await checkInvariants(db, b.branchId)).some((v) => v.check.startsWith('daily_branch_stats hoàn thành')));
  });
});
