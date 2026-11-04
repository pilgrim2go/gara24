// Route chỉ dùng cho demo local. Tắt hoàn toàn (404) khi DEV_AUTH khác '1' HOẶC khi đã cấu hình Cloudflare Access,
// để lỡ để DEV_AUTH trên môi trường thật cũng không mở được cửa giả danh và nạp dữ liệu mẫu.
import type { Hono } from 'hono';
import { type D1, runBatch, uuidv7, BizError } from '../lib.ts';
import * as ops from '../ops.ts';
import type { Role } from './auth.ts';

export const DEMO_BRANCH = 'demo-q7';
const DAY = 86_400_000;

export const devEnabled = (env: { DEV_AUTH?: string; ACCESS_TEAM_DOMAIN?: string }) => env.DEV_AUTH === '1' && !env.ACCESS_TEAM_DOMAIN;

export function registerDev(app: Hono<any>) {
  app.use('/dev/*', async (c, next) => {
    if (!devEnabled(c.env)) return c.json({ error: 'not_found' }, 404);
    await next();
  });

  // Danh sách người dùng mẫu để chọn vai khi demo
  app.get('/dev/users', async (c) => {
    const { results } = await (c.env.DB as D1).prepare(`
      SELECT u.email, u.full_name, group_concat(r.role) AS roles FROM users u
      JOIN user_roles r ON r.user_id = u.id AND r.revoked_at IS NULL
      WHERE u.branch_id = ? GROUP BY u.id ORDER BY u.full_name`).bind(DEMO_BRANCH).all<any>();
    return c.json(results.map((r) => ({ email: r.email, full_name: r.full_name, roles: String(r.roles).split(',') })));
  });

  app.post('/dev/seed', async (c) => c.json(await seedDemo(c.env.DB as D1, Date.now())));

  // Giả lập ngân hàng báo tiền về cho một mã QR (thay cho webhook có chữ ký)
  app.post('/dev/simulate-bank', async (c) => {
    const { intent_id, amount_vnd } = await c.req.json<{ intent_id: string; amount_vnd?: number }>();
    const db = c.env.DB as D1;
    const i = await db.prepare(`SELECT id, branch_id, work_order_id, amount_vnd, transfer_ref FROM payment_intents WHERE id = ?`).bind(intent_id).first<any>();
    if (!i) return c.json({ error: 'not_found' }, 404);
    const now = Date.now(), amount = amount_vnd ?? i.amount_vnd, txn = `SIM-${uuidv7(now)}`;
    try {
      await ops.postQrPayment(db, { branchId: i.branch_id, provider: 'simulator', providerTxnId: txn, amount, memo: `CK ${i.transfer_ref}`,
        intentId: i.id, woId: i.work_order_id, bankTxnId: uuidv7(now), paymentId: uuidv7(now), now });
      return c.json({ status: 'matched' });
    } catch (e) {
      if (e instanceof BizError && e.code === 'INTENT_STALE') {
        await ops.recordUnmatchedBankTxn(db, { branchId: i.branch_id, provider: 'simulator', providerTxnId: txn, amount, memo: `CK ${i.transfer_ref}`, bankTxnId: uuidv7(now), now });
        return c.json({ status: 'unmatched' });
      }
      throw e;
    }
  });
}

const PEOPLE: Array<[string, string, Role[]]> = [
  ['chu', 'Anh Hùng (chủ gara)', ['owner']],
  ['quanly', 'Chị Mai (quản lý xưởng)', ['manager']],
  ['covan', 'Lan (cố vấn dịch vụ)', ['advisor']],
  ['tho.tuan', 'Tuấn (thợ)', ['technician']],
  ['tho.hai', 'Hải (thợ)', ['technician']],
  ['kho', 'Phúc (thủ kho)', ['storekeeper']],
  ['thungan', 'Ngọc (thu ngân)', ['cashier']],
  ['ketoan', 'Chị Thảo (kế toán)', ['accountant']],
  ['ndt', 'Ông Minh (nhà đầu tư)', ['investor']],
];

const CARS: Array<[string, string, string, number]> = [
  ['51H-123.45', 'Toyota', 'Vios', 2019], ['61A-112.23', 'Ford', 'Ranger', 2021], ['51K-678.90', 'Honda', 'CR-V', 2020],
  ['30G-246.80', 'Mazda', '3', 2018], ['51G-456.12', 'Hyundai', 'Accent', 2022], ['51A-789.01', 'Toyota', 'Innova', 2017],
];

// [mã, tên, đvt, giá bán, giá nhập, số lượng nhập]
const PARTS: Array<[string, string, string, number, number, number]> = [
  ['DAU-5W30', 'Dầu động cơ 5W-30', 'lít', 180_000, 120_000, 60],
  ['LOC-DAU-VIOS', 'Lọc dầu Vios', 'cái', 120_000, 70_000, 12],
  ['MP-TRUOC-VIOS', 'Má phanh trước Vios', 'bộ', 650_000, 420_000, 6],
  ['DIA-PHANH-VIOS', 'Đĩa phanh trước Vios', 'cái', 980_000, 640_000, 4],
  ['LOC-GIO-DH', 'Lọc gió điều hòa', 'cái', 250_000, 140_000, 15],
  ['NUOC-LM', 'Nước làm mát', 'lít', 90_000, 55_000, 40],
  ['BUGI-IRIDIUM', 'Bugi iridium', 'cái', 320_000, 210_000, 16],
  ['ACQUY-60AH', 'Ắc quy 60Ah', 'bình', 1_850_000, 1_420_000, 3],
];

export async function seedDemo(db: D1, now: number) {
  const exists = await db.prepare(`SELECT 1 FROM branches WHERE id = ?`).bind(DEMO_BRANCH).first();
  if (exists) return { seeded: false, branch_id: DEMO_BRANCH };

  const { warehouseId } = await ops.seedBranch(db, { branchId: DEMO_BRANCH, code: 'Q7', now });
  await runBatch(db, [
    db.prepare(`UPDATE branches SET name = 'Gara Quận 7' WHERE id = ?`).bind(DEMO_BRANCH),
    ...PEOPLE.flatMap(([slug, name, roles]) => [
      db.prepare(`INSERT INTO users(id, branch_id, full_name, email) VALUES (?, ?, ?, ?)`).bind(`u-${slug}`, DEMO_BRANCH, name, `${slug}@demo.gara24`),
      ...roles.map((r) => db.prepare(`INSERT INTO user_roles(user_id, branch_id, role, granted_by) VALUES (?, ?, ?, 'seed')`).bind(`u-${slug}`, DEMO_BRANCH, r)),
    ]),
    ...CARS.flatMap(([plate, make, model, year], i) => [
      db.prepare(`INSERT INTO vehicles(id, branch_id, make, model, model_year) VALUES (?, ?, ?, ?, ?)`).bind(`veh-${i}`, DEMO_BRANCH, make, model, year),
      db.prepare(`INSERT INTO vehicle_plates(id, branch_id, vehicle_id, plate_norm, plate_display, valid_from) VALUES (?, ?, ?, ?, ?, 0)`)
        .bind(`vp-${i}`, DEMO_BRANCH, `veh-${i}`, plate.replace(/[^0-9A-Z]/gi, ''), plate),
    ]),
  ]);
  const itemIds: Record<string, string> = {};
  for (const [code, name, uom, price] of PARTS) {
    const id = `item-${code}`;
    itemIds[code] = id;
    await runBatch(db, [
      db.prepare(`INSERT INTO items(id, branch_id, code, name, item_type, uom, default_price_vnd) VALUES (?, ?, ?, ?, 'part', ?, ?)`).bind(id, DEMO_BRANCH, code, name, uom, price),
      db.prepare(`INSERT INTO stock_balances(warehouse_id, item_id, branch_id) VALUES (?, ?, ?)`).bind(warehouseId, id, DEMO_BRANCH),
    ]);
  }
  await ops.receiveStock(db, { key: uuidv7(), branchId: DEMO_BRANCH, userId: 'u-kho', docId: uuidv7(), warehouseId, now: now - 10 * DAY,
    lines: PARTS.map(([code, , , , cost, qty]) => ({ move_id: uuidv7(), item_id: itemIds[code], qty_m: qty * 1000, unit_cost_vnd: cost })) });

  const ver = async (id: string) => (await db.prepare(`SELECT version v FROM work_orders WHERE id = ?`).bind(id).first<{ v: number }>())!.v;
  async function order(vehicle: number, at: number, lines: Array<['labor' | 'part', string, number, number?]>, to: string[]) {
    const woId = uuidv7(at);
    await ops.createWorkOrder(db, { key: uuidv7(), branchId: DEMO_BRANCH, userId: 'u-covan', woId, vehicleId: `veh-${vehicle}`, now: at });
    await db.prepare(`UPDATE work_orders SET promised_at = ?, advisor_id = 'u-covan' WHERE id = ?`).bind(at + 8 * 3600_000, woId).run();
    const parts: Array<{ id: string; item: string; qty: number }> = [];
    await ops.addLines(db, { branchId: DEMO_BRANCH, userId: 'u-covan', woId, expectedVersion: await ver(woId), now: at, lines: lines.map(([type, what, qty, price]) => {
      const id = uuidv7(at);
      if (type === 'part') {
        const p = PARTS.find((x) => x[0] === what)!;
        parts.push({ id, item: itemIds[what], qty });
        return { id, line_type: 'part' as const, item_id: itemIds[what], description: p[1], qty_m: qty * 1000, unit_price_vnd: p[3] };
      }
      return { id, line_type: 'labor' as const, description: what, qty_m: qty * 1000, unit_price_vnd: price! };
    }) });
    for (const t of to) {
      await ops.transition(db, { branchId: DEMO_BRANCH, userId: 'u-covan', woId, expectedVersion: await ver(woId), to: t, now: at });
      if (t === 'in_progress' && parts.length) {
        await ops.issueStock(db, { key: uuidv7(), branchId: DEMO_BRANCH, userId: 'u-kho', woId, docId: uuidv7(), warehouseId, now: at,
          lines: parts.map((p) => ({ move_id: uuidv7(), line_id: p.id, item_id: p.item, qty_m: p.qty * 1000 })) });
      }
    }
    return woId;
  }

  await order(0, now - 3 * 3600_000, [['labor', 'Công bảo dưỡng 10.000 km', 1, 350_000], ['part', 'DAU-5W30', 4], ['part', 'LOC-DAU-VIOS', 1],
    ['labor', 'Công thay má phanh trước', 1, 300_000], ['part', 'MP-TRUOC-VIOS', 1]], ['approved', 'in_progress']);
  await order(1, now - 5 * 3600_000, [['labor', 'Kiểm tra hệ thống làm mát', 1, 250_000], ['part', 'NUOC-LM', 6]], ['approved', 'in_progress']);
  const waiting = await order(2, now - 4 * DAY, [['labor', 'Thay bơm nước', 1, 800_000]], ['approved', 'in_progress']);
  await db.prepare(`INSERT INTO work_order_holds(id, branch_id, work_order_id, reason, started_at, note) VALUES (?, ?, ?, 'parts', ?, ?)`)
    .bind(uuidv7(), DEMO_BRANCH, waiting, now - 4 * DAY + 3600_000, 'Nhà cung cấp hẹn giao bơm nước').run();
  await order(3, now - 1 * 3600_000, [['labor', 'Kiểm tra tiếng kêu gầm', 1, 200_000]], []);
  await order(4, now - 2 * 3600_000, [['labor', 'Công thay bugi', 1, 200_000], ['part', 'BUGI-IRIDIUM', 4]], ['quoted']);
  const paid = await order(5, now - 26 * 3600_000, [['labor', 'Vệ sinh dàn lạnh', 1, 450_000], ['part', 'LOC-GIO-DH', 1]], ['approved', 'in_progress', 'qc', 'delivered']);
  const intentId = uuidv7(now);
  await ops.createPaymentIntent(db, { branchId: DEMO_BRANCH, woId: paid, intentId, transferRef: `G24${intentId.slice(-10).replace(/-/g, '0')}`, ttlMs: 900_000, now: now - 25 * 3600_000 });
  await ops.postQrPayment(db, { branchId: DEMO_BRANCH, provider: 'simulator', providerTxnId: `SEED-${intentId}`, amount: 700_000, memo: 'seed',
    intentId, woId: paid, bankTxnId: uuidv7(), paymentId: uuidv7(), now: now - 25 * 3600_000 + 60_000 });
  return { seeded: true, branch_id: DEMO_BRANCH };
}
