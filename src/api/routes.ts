import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, asc, gte, lte, desc } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema.ts';
import { type D1, BizError, uuidv7 } from '../lib.ts';
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

  app.get('/api/work-orders/:id/audit', async (c) => {
    need(c, 'audit.read');
    const a = c.get('actor'), woId = c.req.param('id');
    await orderInBranch(c, woId);
    const db = c.env.DB;
    // Vai không thấy giá vốn: lọc dòng nhạy cảm ngay trong SQL, không lấy lên rồi mới bỏ.
    const { results } = await db.prepare(`
      SELECT at, actor_id, action, reason, changes_json FROM audit_log
      WHERE branch_id = ?1 AND ((entity = 'work_order' AND entity_id = ?2)
         OR (entity = 'stock_doc' AND entity_id IN (SELECT id FROM stock_docs WHERE work_order_id = ?2)))
        AND (sensitive = 0 OR ?3 = 1)
      ORDER BY at`).bind(a.branchId, woId, seesCost(a) ? 1 : 0).all<any>();
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
  const base = { ...snake(w), plate: plate?.p ?? null, lines: lines.map(snake) };
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

const snake = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, val]) => [k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()), val]));

async function hmacOk(secret: string, raw: string, sigHex: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const sig = sigHex.match(/^[0-9a-f]{64}$/i) ? Uint8Array.from(sigHex.match(/../g)!.map((h) => parseInt(h, 16))) : new Uint8Array();
  return sig.length === 32 && crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(raw));
}
