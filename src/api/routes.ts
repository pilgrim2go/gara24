import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, asc, gte, lte, desc } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema.ts';
import { type D1, BizError, uuidv7, bizDate, runBatch, audit, guardExists, guardNotExists } from '../lib.ts';
import { registerDev } from './dev.ts';
import * as ops from '../ops.ts';
import { type Actor, type Perm, PERMS, can, seesCost, verifyAccessJwt, resolveActor } from './auth.ts';
import * as v from './views.ts';

export type Env = {
  DB: D1;
  ACCESS_TEAM_DOMAIN?: string;     // vd: gara24.cloudflareaccess.com
  ACCESS_AUD?: string;             // Application Audience (AUD) tag của ứng dụng Access
  DEV_AUTH?: string;               // '1' chỉ khi chạy local: tin header x-dev-user-email
  BANK_WEBHOOK_SECRET?: string;
  WEBHOOK_BRANCH_ID?: string;      // chi nhánh nhận giao dịch không ghép được
};
type Vars = { actor: Actor };
type C = Context<{ Bindings: Env; Variables: Vars }>;

const orm = (c: C) => drizzle(c.env.DB as any, { schema: s });

class HttpError extends Error {
  status: number;
  constructor(status: number, code: string) { super(code); this.status = status; }
}
const need = (c: C, p: Perm) => { if (!can(c.get('actor'), p)) throw new HttpError(403, 'forbidden'); };
const body = async <T extends z.ZodTypeAny>(c: C, schema: T): Promise<z.infer<T>> => {
  const r = schema.safeParse(await c.req.json().catch(() => undefined));
  if (!r.success) throw new HttpError(400, 'invalid_input');
  return r.data;
};
const idemKey = (c: C) => {
  const k = c.req.header('idempotency-key');
  if (!k || k.length < 8 || k.length > 100) throw new HttpError(400, 'idempotency_key_required');
  return `${c.get('actor').userId}:${k}`;
};

// Mọi truy cập lệnh đều kèm branch_id của người gọi. branch_id của lệnh không đổi được (trigger).
async function orderInBranch(c: C, woId: string) {
  const row = await orm(c).select({ id: s.workOrders.id }).from(s.workOrders)
    .where(and(eq(s.workOrders.id, woId), eq(s.workOrders.branchId, c.get('actor').branchId))).get();
  if (!row) throw new HttpError(404, 'not_found');
}

export function api() {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();

  app.onError((e, c) => {
    if (e instanceof HttpError) return c.json({ error: e.message }, e.status as any);
    if (e instanceof BizError) return c.json({ error: e.code }, e.code === 'DB_ERROR' ? 500 : 409);
    console.error(e);
    return c.json({ error: 'internal' }, 500);
  });

  // ------------------------------------------------------------ webhook ngân hàng: HMAC, không qua Access
  app.post('/webhooks/bank/:provider', async (c) => {
    const secret = c.env.BANK_WEBHOOK_SECRET;
    const raw = await c.req.text();
    if (!secret || !(await hmacOk(secret, raw, c.req.header('x-signature') ?? ''))) return c.json({ error: 'bad_signature' }, 401);
    const parsed = v.BankWebhookIn.safeParse(JSON.parse(raw));
    if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
    const p = parsed.data, provider = c.req.param('provider'), db = c.env.DB, now = Date.now();
    const ref = p.memo.match(/G24[0-9a-f]{10}/i)?.[0];
    const intent = ref
      ? await db.prepare(`SELECT id, branch_id, work_order_id FROM payment_intents WHERE transfer_ref = ?`).bind(ref).first<{ id: string; branch_id: string; work_order_id: string }>()
      : null;
    const unmatched = async (branchId: string | undefined) => {
      if (!branchId) return c.json({ status: 'unmatched_no_branch' }, 202);
      await ops.recordUnmatchedBankTxn(db, { branchId, provider, providerTxnId: p.txn_id, amount: p.amount_vnd, memo: p.memo, bankTxnId: uuidv7(now), now });
      return c.json({ status: 'unmatched' });
    };
    try {
      if (!intent) return await unmatched(c.env.WEBHOOK_BRANCH_ID);
      await ops.postQrPayment(db, { branchId: intent.branch_id, provider, providerTxnId: p.txn_id, amount: p.amount_vnd, memo: p.memo,
        intentId: intent.id, woId: intent.work_order_id, bankTxnId: uuidv7(now), paymentId: uuidv7(now), now });
      return c.json({ status: 'matched' });
    } catch (e) {
      if (e instanceof BizError && e.code === 'DUPLICATE_BANK_TXN') return c.json({ status: 'duplicate' });
      if (e instanceof BizError && (e.code === 'INTENT_STALE' || e.code === 'PERIOD_CLOSED')) return await unmatched(intent!.branch_id);
      throw e;
    }
  });

  registerDev(app);

  // ------------------------------------------------------------ xác thực cho /api/*
  app.use('/api/*', async (c, next) => {
    let email: string | undefined;
    const jwt = c.req.header('cf-access-jwt-assertion');
    if (jwt && c.env.ACCESS_TEAM_DOMAIN && c.env.ACCESS_AUD) {
      try { email = (await verifyAccessJwt(jwt, { teamDomain: c.env.ACCESS_TEAM_DOMAIN, aud: c.env.ACCESS_AUD })).email; }
      catch { return c.json({ error: 'unauthenticated' }, 401); }
    } else if (c.env.DEV_AUTH === '1') {
      email = c.req.header('x-dev-user-email')?.toLowerCase();
    }
    if (!email) return c.json({ error: 'unauthenticated' }, 401);
    const actor = await resolveActor(c.env.DB, email, c.req.header('x-branch-id'));
    if ('error' in actor) return c.json({ error: actor.error }, actor.error === 'branch_required' ? 400 : 403);
    c.set('actor', actor);
    await next();
  });

  // ------------------------------------------------------------ người dùng hiện tại, danh mục
  app.get('/api/me', async (c) => {
    const a = c.get('actor');
    const u = await c.env.DB.prepare(`SELECT u.full_name, b.name AS branch_name FROM users u JOIN branches b ON b.id = ?2 WHERE u.id = ?1`)
      .bind(a.userId, a.branchId).first<{ full_name: string; branch_name: string }>();
    return c.json(v.MeView.parse({
      user_id: a.userId, email: a.email, full_name: u!.full_name, branch_id: a.branchId, branch_name: u!.branch_name,
      roles: a.roles, sees_cost: seesCost(a), perms: (Object.keys(PERMS) as Perm[]).filter((p) => can(a, p)),
    }));
  });

  // Bảng điều phối: lệnh đang mở của chi nhánh, không có giá vốn
  app.get('/api/work-orders', async (c) => {
    need(c, 'wo.read');
    const a = c.get('actor');
    const scope = c.req.query('scope') === 'all' ? 'all' : 'open';
    const { results } = await c.env.DB.prepare(`
      SELECT w.id, w.order_no, w.status, w.payment_status, w.received_at, w.promised_at, w.grand_total_vnd, w.paid_vnd, w.locked_at, w.version,
             v.make, v.model,
             (SELECT reason FROM work_order_holds h WHERE h.work_order_id = w.id AND h.ended_at IS NULL LIMIT 1) AS hold_reason,
             (SELECT started_at FROM work_order_holds h WHERE h.work_order_id = w.id AND h.ended_at IS NULL LIMIT 1) AS hold_started_at,
             (SELECT plate_display FROM vehicle_plates p WHERE p.vehicle_id = w.vehicle_id ORDER BY valid_from DESC LIMIT 1) AS plate
      FROM work_orders w JOIN vehicles v ON v.id = w.vehicle_id
      WHERE w.branch_id = ?1 AND (?2 = 'all' OR w.status IN ('received','quoted','approved','in_progress','qc')
            OR (w.status = 'delivered' AND w.payment_status <> 'paid'))
      ORDER BY w.received_at DESC LIMIT 200`).bind(a.branchId, scope).all<any>();
    return c.json(results.map((r) => v.WorkOrderListItem.parse(r)));
  });

  app.get('/api/vehicles', async (c) => {
    need(c, 'catalog.read');
    const q = (c.req.query('q') ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 12);
    const { results } = await c.env.DB.prepare(`
      SELECT v.id, v.vin, v.make, v.model, v.model_year, p.plate_display AS plate
      FROM vehicles v JOIN vehicle_plates p ON p.vehicle_id = v.id AND p.valid_to IS NULL
      WHERE p.plate_norm LIKE ?1 ORDER BY p.plate_norm LIMIT 20`).bind(`%${q}%`).all<any>();
    return c.json(results.map((r) => v.VehicleView.parse(r)));
  });

  app.post('/api/vehicles', async (c) => {
    need(c, 'vehicle.create');
    const a = c.get('actor'), p = await body(c, v.CreateVehicleIn), id = uuidv7(), now = Date.now();
    const norm = p.plate.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    await runBatch(c.env.DB, [
      c.env.DB.prepare(`INSERT INTO vehicles(id, branch_id, vin, make, model, model_year) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, a.branchId, p.vin?.toUpperCase() ?? null, p.make ?? null, p.model ?? null, p.model_year ?? null),
      c.env.DB.prepare(`INSERT INTO vehicle_plates(id, branch_id, vehicle_id, plate_norm, plate_display, valid_from) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(uuidv7(), a.branchId, id, norm, p.plate.toUpperCase(), now),
      audit(c.env.DB, { branchId: a.branchId, actor: a.userId, entity: 'vehicle', entityId: id, action: 'create', changes: p, now }),
    ]);
    return c.json(v.VehicleView.parse({ id, plate: p.plate.toUpperCase(), vin: p.vin ?? null, make: p.make ?? null, model: p.model ?? null, model_year: p.model_year ?? null }), 201);
  });

  app.get('/api/items', async (c) => {
    need(c, 'catalog.read');
    const a = c.get('actor');
    const q = (c.req.query('q') ?? '').slice(0, 40);
    const { results } = await c.env.DB.prepare(`
      SELECT i.id, i.code, i.name, i.item_type, i.uom, i.default_price_vnd, COALESCE(SUM(b.on_hand_qty_m), 0) AS on_hand_qty_m
      FROM items i LEFT JOIN stock_balances b ON b.item_id = i.id AND b.branch_id = ?1
      WHERE i.active = 1 AND (i.name LIKE ?2 OR i.code LIKE ?2)
      GROUP BY i.id ORDER BY i.name LIMIT 50`).bind(a.branchId, `%${q}%`).all<any>();
    return c.json(results.map((r) => v.ItemView.parse(r)));
  });

  app.get('/api/warehouses', async (c) => {
    need(c, 'catalog.read');
    const rows = await orm(c).select({ id: s.warehouses.id, code: s.warehouses.code, name: s.warehouses.name })
      .from(s.warehouses).where(eq(s.warehouses.branchId, c.get('actor').branchId)).all();
    return c.json(rows);
  });

  // ------------------------------------------------------------ lệnh sửa chữa
  app.post('/api/work-orders', async (c) => {
    need(c, 'wo.create');
    const a = c.get('actor'), p = await body(c, v.CreateWorkOrderIn), woId = p.id ?? uuidv7();
    const veh = await orm(c).select({ id: s.vehicles.id }).from(s.vehicles).where(eq(s.vehicles.id, p.vehicle_id)).get();
    if (!veh) throw new HttpError(404, 'vehicle_not_found');
    const r = await ops.createWorkOrder(c.env.DB, { key: idemKey(c), branchId: a.branchId, userId: a.userId, woId, vehicleId: p.vehicle_id, now: Date.now() });
    return c.json({ id: woId, ...r }, 201);
  });

  app.get('/api/work-orders/:id', async (c) => {
    need(c, 'wo.read');
    return c.json(await readOrder(c, c.req.param('id')));
  });

  app.post('/api/work-orders/:id/lines', async (c) => {
    need(c, 'wo.lines');
    const a = c.get('actor'), woId = c.req.param('id'), p = await body(c, v.AddLinesIn);
    await orderInBranch(c, woId);
    await ops.addLines(c.env.DB, { branchId: a.branchId, userId: a.userId, woId, expectedVersion: p.expected_version, now: Date.now(),
      lines: p.lines.map((l) => ({ ...l, id: l.id ?? uuidv7(), item_id: l.item_id ?? null })) });
    return c.json(await readOrder(c, woId));
  });

  app.post('/api/work-orders/:id/transition', async (c) => {
    need(c, 'wo.transition');
    const a = c.get('actor'), woId = c.req.param('id'), p = await body(c, v.TransitionIn);
    // Thợ chỉ được chuyển sang đang sửa hoặc chờ kiểm tra
    const onlyTech = !a.roles.some((r) => r !== 'technician' && (PERMS['wo.transition'] as readonly string[]).includes(r));
    if (onlyTech && !['in_progress', 'qc'].includes(p.to)) {
      throw new HttpError(403, 'forbidden');
    }
    await orderInBranch(c, woId);
    await ops.transition(c.env.DB, { branchId: a.branchId, userId: a.userId, woId, expectedVersion: p.expected_version, to: p.to, now: Date.now() });
    return c.json(await readOrder(c, woId));
  });

  app.post('/api/work-orders/:id/issue', async (c) => {
    need(c, 'wo.issue');
    const a = c.get('actor'), woId = c.req.param('id'), p = await body(c, v.IssueIn);
    await orderInBranch(c, woId);
    const wh = await orm(c).select({ id: s.warehouses.id }).from(s.warehouses)
      .where(and(eq(s.warehouses.id, p.warehouse_id), eq(s.warehouses.branchId, a.branchId))).get();
    if (!wh) throw new HttpError(404, 'warehouse_not_found');
    await ops.issueStock(c.env.DB, { key: idemKey(c), branchId: a.branchId, userId: a.userId, woId, docId: uuidv7(), warehouseId: p.warehouse_id, now: Date.now(),
      lines: p.lines.map((l) => ({ ...l, move_id: uuidv7() })) });
    return c.json(await readOrder(c, woId));
  });

  app.post('/api/work-orders/:id/cancel', async (c) => {
    need(c, 'wo.cancel');
    const a = c.get('actor'), woId = c.req.param('id'), p = await body(c, v.CancelIn);
    await orderInBranch(c, woId);
    await ops.cancelWorkOrder(c.env.DB, { key: idemKey(c), branchId: a.branchId, userId: a.userId, woId, expectedVersion: p.expected_version,
      paidAction: p.paid_action, reasonCode: p.reason_code, reason: p.reason, returnDocId: uuidv7(), refundPaymentId: uuidv7(), now: Date.now() });
    return c.json(await readOrder(c, woId));
  });

  // "Chờ" là khoảng thời gian có lý do (G1-01); mỗi lệnh tối đa một khoảng chờ đang mở.
  app.post('/api/work-orders/:id/holds', async (c) => {
    need(c, 'wo.transition');
    const a = c.get('actor'), woId = c.req.param('id'), p = await body(c, v.HoldIn), now = Date.now(), db = c.env.DB;
    await orderInBranch(c, woId);
    await runBatch(db, [
      guardNotExists(db, 'ORDER_NOT_EDITABLE', `SELECT 1 FROM work_orders WHERE id = ? AND status IN ('approved','in_progress','qc')`, woId),
      guardExists(db, 'HOLD_ALREADY_OPEN', `SELECT 1 FROM work_order_holds WHERE work_order_id = ? AND ended_at IS NULL`, woId),
      db.prepare(`INSERT INTO work_order_holds(id, branch_id, work_order_id, reason, started_at, note) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(uuidv7(now), a.branchId, woId, p.reason, now, p.note ?? null),
      audit(db, { branchId: a.branchId, actor: a.userId, entity: 'work_order', entityId: woId, action: 'hold_start', changes: p, now }),
    ]);
    return c.json(await readOrder(c, woId));
  });

  app.post('/api/work-orders/:id/holds/end', async (c) => {
    need(c, 'wo.transition');
    const a = c.get('actor'), woId = c.req.param('id'), now = Date.now(), db = c.env.DB;
    await orderInBranch(c, woId);
    await runBatch(db, [
      guardNotExists(db, 'NO_OPEN_HOLD', `SELECT 1 FROM work_order_holds WHERE work_order_id = ? AND ended_at IS NULL`, woId),
      db.prepare(`UPDATE work_order_holds SET ended_at = ? WHERE work_order_id = ? AND ended_at IS NULL`).bind(now, woId),
      audit(db, { branchId: a.branchId, actor: a.userId, entity: 'work_order', entityId: woId, action: 'hold_end', now }),
    ]);
    return c.json(await readOrder(c, woId));
  });

  app.post('/api/work-orders/:id/reopen', async (c) => {
    need(c, 'wo.reopen');
    const a = c.get('actor'), woId = c.req.param('id'), p = await body(c, v.ReopenIn);
    await orderInBranch(c, woId);
    await ops.reopenWorkOrder(c.env.DB, { branchId: a.branchId, userId: a.userId, woId, reason: p.reason, now: Date.now() });
    return c.json(await readOrder(c, woId));
  });

  app.post('/api/work-orders/:id/payment-intents', async (c) => {
    need(c, 'pay.intent');
    const a = c.get('actor'), woId = c.req.param('id'), now = Date.now();
    await orderInBranch(c, woId);
    const intentId = uuidv7(now);
    const transferRef = `G24${crypto.getRandomValues(new Uint8Array(5)).reduce((x, b) => x + b.toString(16).padStart(2, '0'), '')}`;
    await ops.createPaymentIntent(c.env.DB, { branchId: a.branchId, woId, intentId, transferRef, ttlMs: 15 * 60_000, now });
    const i = await orm(c).select().from(s.paymentIntents).where(eq(s.paymentIntents.id, intentId)).get();
    // qr_payload (chuỗi VietQR) dựng ở bước tích hợp ngân hàng; bản thử chỉ trả mã nội dung chuyển khoản.
    return c.json({ intent_id: intentId, transfer_ref: transferRef, amount_vnd: i!.amountVnd, expires_at: i!.expiresAt }, 201);
  });

  // Thu tiền mặt: idempotency key bắt buộc; gửi lặp trả lại đúng phiếu cũ (200), lần đầu 201.
  app.post('/api/work-orders/:id/payments/cash', async (c) => {
    need(c, 'pay.cash');
    const a = c.get('actor'), woId = c.req.param('id'), p = await body(c, v.CashPaymentIn), now = Date.now();
    await orderInBranch(c, woId);
    const r = await ops.postCashPayment(c.env.DB, { key: idemKey(c), branchId: a.branchId, userId: a.userId, woId, paymentId: uuidv7(now),
      amount: p.amount_vnd, note: p.note ?? null, now });
    const paymentId = 'replayed' in r ? r.resultRef : r.paymentId;
    const pay = await c.env.DB.prepare(`SELECT id, doc_no, method, amount_vnd, biz_date, at, note, cash_session_id FROM payments WHERE id = ? AND branch_id = ?`)
      .bind(paymentId, a.branchId).first<any>();
    if (!pay) throw new HttpError(404, 'not_found');
    return c.json({ payment: v.PaymentView.parse(pay), order: await readOrder(c, woId) }, 'replayed' in r ? 200 : 201);
  });

  // ------------------------------------------------------------ ca thu ngân
  // Quản lý, chủ, kế toán xem mọi ca của chi nhánh; thu ngân chỉ ca của mình (ca người khác trả 404, không lộ sự tồn tại).
  app.post('/api/cash-sessions', async (c) => {
    need(c, 'cash.session');
    const a = c.get('actor'), p = await body(c, v.OpenCashSessionIn), now = Date.now();
    const r = await ops.openCashSession(c.env.DB, { key: idemKey(c), branchId: a.branchId, userId: a.userId, sessionId: uuidv7(now),
      denominations: p.denominations, note: p.note ?? null, now });
    const id = 'replayed' in r ? r.resultRef : r.sessionId;
    return c.json(await readSession(c, id, true), 'replayed' in r ? 200 : 201);
  });

  app.get('/api/cash-sessions/current', async (c) => {
    need(c, 'cash.session');
    const a = c.get('actor'), db = c.env.DB;
    const req = await db.prepare(`SELECT ${ops.requireSessionSql(1, 2)} AS v`).bind(a.branchId, bizDate(Date.now())).first<{ v: number }>();
    const open = await db.prepare(`SELECT id FROM cash_sessions WHERE branch_id = ? AND holder_id = ? AND status = 'open'`)
      .bind(a.branchId, a.userId).first<{ id: string }>();
    return c.json({ require_session: Number(req?.v) === 1, session: open ? await readSession(c, open.id, false) : null });
  });

  app.get('/api/cash-sessions', async (c) => {
    if (!can(c.get('actor'), 'cash.session') && !can(c.get('actor'), 'cash.session.all')) throw new HttpError(403, 'forbidden');
    const a = c.get('actor'), date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const q = z.object({ status: z.enum(['open', 'closed', 'all']).default('all'), from: date.optional(), to: date.optional() }).safeParse(c.req.query());
    if (!q.success) throw new HttpError(400, 'invalid_input');
    const all = can(a, 'cash.session.all');
    const rows = await sessionRows(c, `s.branch_id = ?1 AND (?2 = 1 OR s.holder_id = ?3) AND (?4 = 'all' OR s.status = ?4)
      AND (?5 IS NULL OR s.biz_date >= ?5) AND (?6 IS NULL OR s.biz_date <= ?6) ORDER BY s.opened_at DESC LIMIT 200`,
      a.branchId, all ? 1 : 0, a.userId, q.data.status, q.data.from ?? null, q.data.to ?? null);
    return c.json(rows);
  });

  app.get('/api/cash-sessions/:id', async (c) => {
    if (!can(c.get('actor'), 'cash.session') && !can(c.get('actor'), 'cash.session.all')) throw new HttpError(403, 'forbidden');
    return c.json(await readSession(c, c.req.param('id'), true));
  });

  // Chốt ca: thu ngân chốt ca của mình; chủ/quản lý chốt hộ được. Số dự kiến tính ở DB, client chỉ gửi số tờ đếm được.
  app.post('/api/cash-sessions/:id/close', async (c) => {
    const a = c.get('actor'), id = c.req.param('id');
    if (!can(a, 'cash.session')) throw new HttpError(403, 'forbidden');
    const p = await body(c, v.CloseCashSessionIn);
    const own = await c.env.DB.prepare(`SELECT holder_id FROM cash_sessions WHERE id = ? AND branch_id = ?`).bind(id, a.branchId).first<{ holder_id: string }>();
    if (!own || (own.holder_id !== a.userId && !can(a, 'cash.session.all'))) throw new HttpError(404, 'not_found');
    if (own.holder_id !== a.userId && !can(a, 'cash.session.manage')) throw new HttpError(403, 'forbidden');
    await ops.closeCashSession(c.env.DB, { key: idemKey(c), branchId: a.branchId, userId: a.userId, sessionId: id,
      denominations: p.denominations, varianceReason: p.variance_reason ?? null, now: Date.now() });
    return c.json(await readSession(c, id, true));
  });

  // Nhập kho mua vào. Chỉ thủ kho/quản lý/chủ; cố vấn, thợ, thu ngân bị chặn vì phiếu có giá nhập.
  app.post('/api/stock/receipts', async (c) => {
    need(c, 'stock.receive');
    const a = c.get('actor'), p = await body(c, v.StockReceiptIn), now = Date.now();
    const wh = await orm(c).select({ id: s.warehouses.id }).from(s.warehouses)
      .where(and(eq(s.warehouses.id, p.warehouse_id), eq(s.warehouses.branchId, a.branchId))).get();
    if (!wh) throw new HttpError(404, 'warehouse_not_found');
    const r = await ops.receiveStock(c.env.DB, { key: idemKey(c), branchId: a.branchId, userId: a.userId, docId: uuidv7(now), warehouseId: p.warehouse_id,
      supplierInvoiceNo: p.supplier_invoice_no ?? null, note: p.note ?? null, now,
      lines: p.lines.map((l) => ({ ...l, move_id: uuidv7(now) })) });
    return c.json(await readReceipt(c, 'replayed' in r ? r.resultRef : r.docId), 'replayed' in r ? 200 : 201);
  });

  app.get('/api/work-orders/:id/audit', async (c) => {
    need(c, 'audit.read');
    const a = c.get('actor'), woId = c.req.param('id');
    await orderInBranch(c, woId);
    const db = c.env.DB;
    // Vai không thấy giá vốn: lọc dòng nhạy cảm ngay trong SQL, không lấy lên rồi mới bỏ.
    const { results } = await db.prepare(`
      SELECT a.at, a.actor_id, ${ACTOR_NAME('a.actor_id')} AS actor_name, a.action, a.reason, a.changes_json
      FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.branch_id = ?1 AND ((a.entity = 'work_order' AND a.entity_id = ?2)
         OR (a.entity = 'stock_doc' AND a.entity_id IN (SELECT id FROM stock_docs WHERE work_order_id = ?2)))
        AND (a.sensitive = 0 OR ?3 = 1)
      ORDER BY a.at, a.rowid`).bind(a.branchId, woId, seesCost(a) ? 1 : 0).all<any>();
    return c.json(results.map((r) => v.AuditView.parse({ ...r, changes: r.changes_json ? JSON.parse(r.changes_json) : null })));
  });

  app.get('/api/dashboard/daily', async (c) => {
    need(c, 'dashboard.read');
    const a = c.get('actor');
    const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(c.req.query());
    if (!q.success) throw new HttpError(400, 'invalid_input');
    const d = s.dailyBranchStats;
    const rows = await orm(c).select().from(d)
      .where(and(eq(d.branchId, a.branchId), gte(d.bizDate, q.data.from), lte(d.bizDate, q.data.to))).orderBy(asc(d.bizDate)).all();
    return c.json(rows.map((r) => v.DailyStatsView.parse(snake(r))));
  });

  // Lãi gộp theo tháng (ghi nhận theo ngày hoàn thành). Tối đa 24 tháng mỗi lần gọi.
  app.get('/api/dashboard/monthly', async (c) => {
    need(c, 'dashboard.read');
    const a = c.get('actor');
    const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
    const q = z.object({ from: ym, to: ym }).refine((x) => x.from <= x.to && monthsBetween(x.from, x.to) <= 24).safeParse(c.req.query());
    if (!q.success) throw new HttpError(400, 'invalid_input');
    const { results } = await c.env.DB.prepare(`
      SELECT substr(biz_date, 1, 7) AS month,
             SUM(orders_completed) AS orders_completed,
             SUM(rev_labor_completed_vnd) AS rev_labor_completed_vnd,
             SUM(rev_parts_completed_vnd) AS rev_parts_completed_vnd,
             SUM(discount_completed_vnd) AS discount_completed_vnd,
             SUM(cogs_completed_vnd) AS cogs_completed_vnd,
             SUM(cogs_provisional_vnd) AS cogs_provisional_vnd,
             SUM(collected_vnd) AS collected_vnd
      FROM daily_branch_stats
      WHERE branch_id = ?1 AND biz_date >= ?2 || '-01' AND biz_date <= ?3 || '-31'
      GROUP BY substr(biz_date, 1, 7) ORDER BY month`).bind(a.branchId, q.data.from, q.data.to).all<any>();
    return c.json(results.map((r) => {
      const net = r.rev_labor_completed_vnd + r.rev_parts_completed_vnd - r.discount_completed_vnd;
      const gross = net - r.cogs_completed_vnd;
      return v.MonthlyStatsView.parse({ ...r, net_revenue_vnd: net, gross_profit_vnd: gross,
        margin_bp: net > 0 ? Math.round((gross * 10000) / net) : null });
    }));
  });

  return app;
}

// ------------------------------------------------------------ đọc lệnh, lọc theo vai
async function readOrder(c: C, woId: string) {
  const a = c.get('actor'), db = orm(c);
  const w = await db.select().from(s.workOrders).where(and(eq(s.workOrders.id, woId), eq(s.workOrders.branchId, a.branchId))).get();
  if (!w) throw new HttpError(404, 'not_found');
  const lines = await db.select().from(s.workOrderLines).where(eq(s.workOrderLines.workOrderId, woId)).orderBy(asc(s.workOrderLines.lineNo)).all();
  const plate = await db.select({ p: s.vehiclePlates.plateDisplay }).from(s.vehiclePlates)
    .where(eq(s.vehiclePlates.vehicleId, w.vehicleId)).orderBy(desc(s.vehiclePlates.validFrom)).get();
  const veh = await db.select({ make: s.vehicles.make, model: s.vehicles.model, model_year: s.vehicles.modelYear }).from(s.vehicles).where(eq(s.vehicles.id, w.vehicleId)).get();
  const hold = await c.env.DB.prepare(`SELECT id, reason, started_at, note FROM work_order_holds WHERE work_order_id = ? AND ended_at IS NULL LIMIT 1`).bind(woId).first<any>();
  const events = await c.env.DB.prepare(`
    SELECT e.at, e.kind, e.from_value, e.to_value, e.by AS by_id, ${ACTOR_NAME('e.by')} AS by_name, e.reason
    FROM work_order_events e LEFT JOIN users u ON u.id = e.by
    WHERE e.work_order_id = ?1 AND e.branch_id = ?2 ORDER BY e.at, e.rowid`).bind(woId, a.branchId).all<any>();
  const base = { ...snake(w), plate: plate?.p ?? null, hold: hold ?? null, vehicle: veh ?? { make: null, model: null, model_year: null },
    lines: lines.map(snake), events: events.results };
  if (!seesCost(a)) return v.WorkOrderView.parse(base);

  const cost = await db.select().from(s.workOrderCosts).where(eq(s.workOrderCosts.workOrderId, woId)).get();
  const moves = await c.env.DB.prepare(`
    SELECT m.id AS move_id, d.doc_no, m.item_id, m.work_order_line_id, m.qty_delta_m, m.total_cost_vnd, m.cost_status, m.biz_date
    FROM stock_moves m JOIN stock_docs d ON d.id = m.stock_doc_id WHERE m.work_order_id = ? ORDER BY d.created_at`).bind(woId).all<any>();
  const partsCost = cost?.partsCostVnd ?? 0;
  const revenue = w.grandTotalVnd;
  return v.WorkOrderCostView.parse({
    ...base,
    cost: {
      parts_cost_vnd: partsCost,
      cost_status: cost?.costStatus ?? 'final',
      gross_profit_vnd: revenue - partsCost,
      margin_bp: revenue > 0 ? Math.round(((revenue - partsCost) * 10000) / revenue) : null,
    },
    stock_moves: moves.results,
  });
}

async function readReceipt(c: C, docId: string) {
  const db = c.env.DB, branchId = c.get('actor').branchId;
  const d = await db.prepare(`SELECT id, doc_no, biz_date, warehouse_id, supplier_invoice_no, note FROM stock_docs
                              WHERE id = ? AND branch_id = ? AND doc_type = 'purchase_receipt'`).bind(docId, branchId).first<any>();
  if (!d) throw new HttpError(404, 'not_found');
  const { results } = await db.prepare(`SELECT item_id, qty_delta_m AS qty_m, total_cost_vnd FROM stock_moves WHERE stock_doc_id = ? ORDER BY rowid`).bind(docId).all<any>();
  return v.StockReceiptView.parse({ ...d, lines: results, total_cost_vnd: results.reduce((x, l) => x + l.total_cost_vnd, 0) });
}

// ------------------------------------------------------------ đọc ca thu ngân
// Số thu/chi tính từ sổ phiếu, không lưu sẵn: ca đang mở luôn ra số dư hiện tại.
async function sessionRows(c: C, where: string, ...args: unknown[]) {
  const { results } = await c.env.DB.prepare(`
    SELECT s.id, s.holder_id, COALESCE(u.full_name, s.holder_id) AS holder_name, s.status, s.biz_date, s.opened_at,
           s.opening_float_vnd, s.opening_denominations_json, s.counted_vnd, s.variance_vnd, s.denominations_json, s.variance_reason,
           s.closed_at, s.closed_by, cu.full_name AS closed_by_name, s.expected_vnd AS stored_expected,
           COALESCE(t.cin, 0) AS cash_in_vnd, COALESCE(t.cout, 0) AS cash_out_vnd, COALESCE(t.n, 0) AS payment_count
    FROM cash_sessions s
    LEFT JOIN users u ON u.id = s.holder_id
    LEFT JOIN users cu ON cu.id = s.closed_by
    LEFT JOIN (SELECT cash_session_id, SUM(CASE WHEN direction = 'in' THEN amount_vnd ELSE 0 END) cin,
                      SUM(CASE WHEN direction = 'out' THEN amount_vnd ELSE 0 END) cout, COUNT(*) n
               FROM payments WHERE cash_session_id IS NOT NULL AND status = 'posted' GROUP BY cash_session_id) t ON t.cash_session_id = s.id
    WHERE ${where}`).bind(...args).all<any>();
  return results.map((r) => v.CashSessionView.parse({
    ...r,
    expected_vnd: r.status === 'closed' ? r.stored_expected : r.opening_float_vnd + r.cash_in_vnd - r.cash_out_vnd,
    opening_denominations: r.opening_denominations_json ? JSON.parse(r.opening_denominations_json) : null,
    denominations: r.denominations_json ? JSON.parse(r.denominations_json) : null,
  }));
}

async function readSession(c: C, id: string, withPayments: boolean) {
  const a = c.get('actor');
  const [row] = await sessionRows(c, `s.id = ?1 AND s.branch_id = ?2 AND (?3 = 1 OR s.holder_id = ?4)`,
    id, a.branchId, can(a, 'cash.session.all') ? 1 : 0, a.userId);
  if (!row) throw new HttpError(404, 'not_found');
  if (!withPayments) return row;
  const { results } = await c.env.DB.prepare(`
    SELECT p.id, p.doc_no, p.direction, p.amount_vnd, p.at, p.note,
           (SELECT w.order_no FROM payment_allocations pa JOIN work_orders w ON w.id = pa.work_order_id
            WHERE pa.payment_id = p.id AND pa.work_order_id IS NOT NULL LIMIT 1) AS order_no
    FROM payments p WHERE p.cash_session_id = ?1 AND p.branch_id = ?2 AND p.status = 'posted' ORDER BY p.at, p.rowid`).bind(id, a.branchId).all<any>();
  return v.CashSessionDetailView.parse({ ...row, payments: results });
}

// Tên người thao tác: lấy từ users (bảng u đã LEFT JOIN). 'system' là Worker tự ghi (webhook); mã lạ trả lại chính mã.
const ACTOR_NAME = (col: string) => `COALESCE(u.full_name, CASE ${col} WHEN 'system' THEN 'Hệ thống' ELSE ${col} END)`;

const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;

const snake = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, val]) => [k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()), val]));

async function hmacOk(secret: string, raw: string, sigHex: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const sig = sigHex.match(/^[0-9a-f]{64}$/i) ? Uint8Array.from(sigHex.match(/../g)!.map((h) => parseInt(h, 16))) : new Uint8Array();
  return sig.length === 32 && crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(raw));
}
