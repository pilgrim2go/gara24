// Worker thăm dò: chạy trên D1 thật để xác nhận những gì local không mô phỏng được
// (giới hạn truy vấn mỗi lần gọi, hành vi trigger/batch trên hạ tầng thật).
import { Hono } from 'hono';
import { type D1, BizError, runBatch, uuidv7 } from './lib.ts';
import {
  seedBranch, seedItem, seedVehicle, createWorkOrder, addLines, transition, receiveStock, issueStock,
  cancelWorkOrder, createPaymentIntent, postQrPayment,
} from './ops.ts';
import { checkInvariants } from './invariants.ts';
import { api } from './api/routes.ts';

type Env = { DB: D1; PROBE_TOKEN?: string };
const app = new Hono<{ Bindings: Env }>();  // các route thăm dò, gắn vào API ở cuối file

// Chặn truy cập: bắt buộc có secret PROBE_TOKEN (wrangler secret put PROBE_TOKEN).
app.use('/probe/*', async (c, next) => {
  const token = c.env.PROBE_TOKEN;
  if (!token || c.req.header('x-probe-token') !== token) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

app.get('/health', (c) => c.json({ ok: true }));

type Step = { step: string; ok: boolean; detail?: unknown };

async function step(log: Step[], name: string, fn: () => Promise<unknown>, expectCode?: string) {
  try {
    const r = await fn();
    log.push(expectCode ? { step: name, ok: false, detail: `mong lỗi ${expectCode} nhưng thành công` } : { step: name, ok: true, detail: r });
  } catch (e) {
    const code = e instanceof BizError ? e.code : String(e);
    log.push({ step: name, ok: code === expectCode, detail: e instanceof BizError ? { code, raw: e.raw.slice(0, 300) } : code });
  }
}

// Kịch bản đầy đủ trên một chi nhánh mới. Khoảng 30 truy vấn, dưới giới hạn 50 của gói Free.
app.post('/probe/scenario', async (c) => {
  const db = c.env.DB;
  const now = Date.now();
  const log: Step[] = [];
  const branchId = uuidv7(now);
  const code = `P${branchId.slice(-7)}`;
  const vehicleId = uuidv7(), itemId = uuidv7(), woId = uuidv7(), lineId = uuidv7(), wo2 = uuidv7(), line2 = uuidv7();
  const userId = 'probe';
  let warehouseId = '';
  const ver = async (id: string) => (await db.prepare(`SELECT version v FROM work_orders WHERE id = ?`).bind(id).first<{ v: number }>())!.v;

  await step(log, 'seed', async () => {
    warehouseId = (await seedBranch(db, { branchId, code, now })).warehouseId;
    await seedVehicle(db, { branchId, vehicleId, plate: `51P-${code}` });
    await seedItem(db, { branchId, itemId, code: `${code}-MP`, warehouseId });
  });
  await step(log, 'nhập 10 @100.000', () => receiveStock(db, { key: uuidv7(), branchId, userId, docId: uuidv7(), warehouseId, now,
    lines: [{ move_id: uuidv7(), item_id: itemId, qty_m: 10_000, unit_cost_vnd: 100_000 }] }));
  await step(log, 'tạo lệnh 1', () => createWorkOrder(db, { key: uuidv7(), branchId, userId, woId, vehicleId, now }));
  await step(log, 'thêm dòng', async () => addLines(db, { branchId, userId, woId, expectedVersion: await ver(woId), now, lines: [
    { id: uuidv7(), line_type: 'labor', description: 'Công', qty_m: 1000, unit_price_vnd: 500_000 },
    { id: lineId, line_type: 'part', item_id: itemId, description: 'Má phanh', qty_m: 2000, unit_price_vnd: 200_000 }] }));
  await step(log, 'duyệt', async () => transition(db, { branchId, userId, woId, expectedVersion: await ver(woId), to: 'approved', now }));
  await step(log, 'xuất 2', () => issueStock(db, { key: uuidv7(), branchId, userId, woId, docId: uuidv7(), warehouseId, now,
    lines: [{ move_id: uuidv7(), line_id: lineId, item_id: itemId, qty_m: 2000 }] }));
  const intentId = uuidv7();
  await step(log, 'tạo QR', () => createPaymentIntent(db, { branchId, woId, intentId, transferRef: `G24${intentId.slice(-10)}`, ttlMs: 900_000, now }));
  const txn = `PROBE-${uuidv7()}`;
  await step(log, 'thu đủ 900.000 → khóa', () => postQrPayment(db, { branchId, provider: 'probe', providerTxnId: txn, amount: 900_000, memo: 'probe',
    intentId, woId, bankTxnId: uuidv7(), paymentId: uuidv7(), now }).then(() => 'ok'));
  await step(log, 'webhook gửi lại', () => postQrPayment(db, { branchId, provider: 'probe', providerTxnId: txn, amount: 900_000, memo: 'probe',
    intentId, woId, bankTxnId: uuidv7(), paymentId: uuidv7(), now }), 'DUPLICATE_BANK_TXN');
  await step(log, 'SQL trực tiếp sửa tiền lệnh đã khóa', () => runBatch(db, [db.prepare(`UPDATE work_orders SET grand_total_vnd = 1 WHERE id = ?`).bind(woId)]), 'ORDER_LOCKED');
  await step(log, 'tạo lệnh 2', () => createWorkOrder(db, { key: uuidv7(), branchId, userId, woId: wo2, vehicleId, now }));
  await step(log, 'lệnh 2: thêm dòng + duyệt', async () => {
    await addLines(db, { branchId, userId, woId: wo2, expectedVersion: await ver(wo2), now, lines: [
      { id: line2, line_type: 'part', item_id: itemId, description: 'Má phanh', qty_m: 9000, unit_price_vnd: 200_000 }] });
    await transition(db, { branchId, userId, woId: wo2, expectedVersion: await ver(wo2), to: 'approved', now });
  });
  await step(log, 'lệnh 2: xuất quá tồn (còn 8)', () => issueStock(db, { key: uuidv7(), branchId, userId, woId: wo2, docId: uuidv7(), warehouseId, now,
    lines: [{ move_id: uuidv7(), line_id: line2, item_id: itemId, qty_m: 9000 }] }), 'INSUFFICIENT_STOCK');
  await step(log, 'lệnh 2: xuất 3 rồi hủy, hoàn kho', async () => {
    await issueStock(db, { key: uuidv7(), branchId, userId, woId: wo2, docId: uuidv7(), warehouseId, now,
      lines: [{ move_id: uuidv7(), line_id: line2, item_id: itemId, qty_m: 3000 }] });
    await cancelWorkOrder(db, { key: uuidv7(), branchId, userId, woId: wo2, expectedVersion: await ver(wo2), paidAction: null,
      reasonCode: 'PROBE', reason: 'probe', returnDocId: uuidv7(), refundPaymentId: uuidv7(), now });
  });
  await step(log, 'bất biến', async () => {
    const v = await checkInvariants(db, branchId);
    if (v.length) throw new Error(JSON.stringify(v));
    return 'không lệch';
  });
  const allOk = log.every((s) => s.ok);
  return c.json({ allOk, branchId, steps: log });
});

// Đo giới hạn: một batch nhiều câu có bị tính là nhiều truy vấn không, và trần truy vấn riêng lẻ.
app.post('/probe/limits', async (c) => {
  const db = c.env.DB;
  const n = Math.min(Number(c.req.query('n') ?? 60), 200);
  const out: Record<string, unknown> = {};
  try {
    const r = await db.batch(Array.from({ length: n }, () => db.prepare('SELECT 1 AS x')));
    out.batchOfN = { n, ok: true, results: r.length };
  } catch (e) {
    out.batchOfN = { n, ok: false, error: String((e as Error).message).slice(0, 300) };
  }
  let done = 0;
  try {
    for (let i = 0; i < n; i++) { await db.prepare('SELECT 1 AS x').first(); done++; }
    out.separateQueries = { n, ok: true, done };
  } catch (e) {
    out.separateQueries = { n, ok: false, failedAfter: done, error: String((e as Error).message).slice(0, 300) };
  }
  return c.json(out);
});

const root = api();
root.route('/', app as any);
export default root;
