// Mỗi hàm = đúng một db.batch(). Không đọc-rồi-quyết-định ở tầng ứng dụng.
import { type D1, type Stmt, runBatch, guardNotExists, guardExists, audit, nextSeq, idem, withIdempotency, uuidv7, bizDate } from './lib.ts';

// Chỉ tăng bộ đếm khi thật sự tạo chứng từ, để số không bị nhảy.
function nextSeqIf(db: D1, branchId: string, seqKey: string, condSql: string, ...args: unknown[]): Stmt {
  return db.prepare(`INSERT INTO sequences(branch_id, seq_key, last_value) SELECT ?, ?, 1 WHERE ${condSql}
                     ON CONFLICT(branch_id, seq_key) DO UPDATE SET last_value = last_value + 1`).bind(branchId, seqKey, ...args);
}

const EDITABLE = `('received','quoted','approved','in_progress','qc')`;

// ---------------------------------------------------------------- ca thu ngân: biểu thức SQL dùng chung
// Giá trị setting hiệu lực tại một ngày, thiếu thì lấy mặc định. Tham số đánh số: ?{b} = branch_id, ?{d} = biz_date.
const settingSql = (key: string, def: string, b: number, d: number) => {
  if (!/^[a-z_.]+$/.test(key) || !/^-?\d+$/.test(def)) throw new Error(`setting không hợp lệ: ${key}`);
  return `COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE branch_id = ?${b} AND key = '${key}'
            AND effective_from <= ?${d} ORDER BY effective_from DESC LIMIT 1), ${def})`;
};
// cash.require_session: mặc định bật (1). Tắt thì thu/chi tiền mặt không cần ca; có ca đang mở vẫn gắn vào ca.
export const requireSessionSql = (b: number, d: number) => settingSql('cash.require_session', '1', b, d);
// cash.variance_reason_threshold_vnd: |chênh lệch| lớn hơn ngưỡng thì bắt buộc lý do. Mặc định 0 = lệch bất kỳ đồng nào.
const varianceThresholdSql = (b: number, d: number) => settingSql('cash.variance_reason_threshold_vnd', '0', b, d);
// Ca đang mở của một người. ?{b} = branch_id, ?{u} = user_id.
const openSessionSql = (b: number, u: number) => `SELECT id FROM cash_sessions WHERE branch_id = ?${b} AND holder_id = ?${u} AND status = 'open'`;
// Số dư sổ sách của ca (alias s): quỹ đầu ca + thu - chi tiền mặt gắn ca.
const SESSION_BALANCE = `(s.opening_float_vnd + COALESCE((SELECT SUM(CASE p.direction WHEN 'in' THEN p.amount_vnd ELSE -p.amount_vnd END)
                          FROM payments p WHERE p.cash_session_id = s.id AND p.status = 'posted'), 0))`;

export const DENOMINATIONS = [500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100] as const;
export type Denominations = Partial<Record<string, number>>;
// Tổng tiền theo mệnh giá; bỏ mệnh giá có 0 tờ để JSON lưu gọn và so sánh được.
export function countDenominations(d: Denominations): { total: number; json: string } {
  const clean: Record<string, number> = {};
  let total = 0;
  for (const v of DENOMINATIONS) {
    const n = d[String(v)] ?? 0;
    if (!Number.isInteger(n) || n < 0) throw new Error(`số tờ không hợp lệ: ${v}`);
    if (n > 0) { clean[String(v)] = n; total += v * n; }
  }
  for (const k of Object.keys(d)) if (!DENOMINATIONS.includes(Number(k) as any)) throw new Error(`mệnh giá không hợp lệ: ${k}`);
  return { total, json: JSON.stringify(clean) };
}

// ---------------------------------------------------------------- dữ liệu nền cho test/probe
export async function seedBranch(db: D1, p: { branchId: string; code: string; now: number; lockPolicy?: string | null }) {
  const stmts: Stmt[] = [
    db.prepare(`INSERT INTO legal_entities(id, code, name) VALUES (?, ?, ?)`).bind(`${p.branchId}:le`, `LE-${p.code}`, `Pháp nhân ${p.code}`),
    db.prepare(`INSERT INTO branches(id, legal_entity_id, code, name) VALUES (?, ?, ?, ?)`).bind(p.branchId, `${p.branchId}:le`, p.code, `Chi nhánh ${p.code}`),
    db.prepare(`INSERT INTO warehouses(id, branch_id, code) VALUES (?, ?, 'KHO1')`).bind(`${p.branchId}:wh`, p.branchId),
  ];
  if (p.lockPolicy !== null) {
    stmts.push(db.prepare(`INSERT INTO settings(branch_id, key, value_json, effective_from, set_by) VALUES (?, 'order.lock_policy', ?, '2000-01-01', 'seed')`)
      .bind(p.branchId, JSON.stringify(p.lockPolicy ?? 'invoice_or_paid')));
  }
  await runBatch(db, stmts);
  return { warehouseId: `${p.branchId}:wh` };
}

export async function seedItem(db: D1, p: { branchId: string; itemId: string; code: string; warehouseId: string; allowNegative?: boolean }) {
  await runBatch(db, [
    db.prepare(`INSERT INTO items(id, branch_id, code, name, item_type, uom, allow_negative) VALUES (?, ?, ?, ?, 'part', 'cái', ?)`)
      .bind(p.itemId, p.branchId, p.code, p.code, p.allowNegative ? 1 : 0),
    db.prepare(`INSERT INTO stock_balances(warehouse_id, item_id, branch_id, allow_negative) VALUES (?, ?, ?, ?)`)
      .bind(p.warehouseId, p.itemId, p.branchId, p.allowNegative ? 1 : 0),
  ]);
}

export async function seedVehicle(db: D1, p: { branchId: string; vehicleId: string; plate: string }) {
  await runBatch(db, [
    db.prepare(`INSERT INTO vehicles(id, branch_id) VALUES (?, ?)`).bind(p.vehicleId, p.branchId),
    db.prepare(`INSERT INTO vehicle_plates(id, branch_id, vehicle_id, plate_norm, plate_display, valid_from) VALUES (?, ?, ?, ?, ?, 0)`)
      .bind(`${p.vehicleId}:p`, p.branchId, p.vehicleId, p.plate.replace(/[^0-9A-Z]/gi, '').toUpperCase(), p.plate),
  ]);
}

// ---------------------------------------------------------------- 2.1 Cấp số lệnh
export async function createWorkOrder(db: D1, p: { key: string; branchId: string; userId: string; woId: string; vehicleId: string; now: number }) {
  const d = bizDate(p.now);
  const seqKey = `RO-${d.slice(0, 4)}`;
  return withIdempotency(db, p.key, async () => {
    const res = await runBatch(db, [
      idem(db, p.key, p.branchId, p.userId, 'wo.create', p.woId, p.now),
      nextSeq(db, p.branchId, seqKey),
      db.prepare(`
        INSERT INTO work_orders(id, branch_id, order_seq, order_no, vehicle_id, status, lock_policy, received_at, received_biz_date, created_by)
        SELECT ?1, ?2, s.last_value, ?3 || '-' || printf('%04d', s.last_value), ?4, 'received',
          (SELECT json_extract(value_json, '$') FROM settings
            WHERE branch_id = ?2 AND key = 'order.lock_policy' AND effective_from <= ?5
            ORDER BY effective_from DESC LIMIT 1),
          ?6, ?5, ?7
        FROM sequences s WHERE s.branch_id = ?2 AND s.seq_key = ?3
        RETURNING order_no`).bind(p.woId, p.branchId, seqKey, p.vehicleId, d, p.now, p.userId),
      db.prepare(`INSERT INTO work_order_events(id, branch_id, work_order_id, kind, to_value, at, by) VALUES (?, ?, ?, 'status', 'received', ?, ?)`)
        .bind(uuidv7(p.now), p.branchId, p.woId, p.now, p.userId),
      db.prepare(`INSERT INTO daily_branch_stats(branch_id, biz_date, orders_received) VALUES (?, ?, 1)
                  ON CONFLICT(branch_id, biz_date) DO UPDATE SET orders_received = orders_received + 1`).bind(p.branchId, d),
      audit(db, { branchId: p.branchId, actor: p.userId, entity: 'work_order', entityId: p.woId, action: 'create', now: p.now }),
    ]);
    return { orderNo: res[2].results[0].order_no as string };
  });
}

// ---------------------------------------------------------------- thêm hạng mục (cần cho test; G1-14 ghi audit)
export type NewLine = { id: string; line_type: 'labor' | 'part' | 'sublet' | 'fee'; item_id?: string | null; description: string; qty_m: number; unit_price_vnd: number };

export async function addLines(db: D1, p: { branchId: string; userId: string; woId: string; expectedVersion: number; lines: NewLine[]; now: number }) {
  const L = JSON.stringify(p.lines);
  await runBatch(db, [
    guardNotExists(db, 'VERSION_CONFLICT', `SELECT 1 FROM work_orders WHERE id = ? AND version = ?`, p.woId, p.expectedVersion),
    guardNotExists(db, 'ORDER_NOT_EDITABLE', `SELECT 1 FROM work_orders WHERE id = ? AND locked_at IS NULL AND status IN ${EDITABLE}`, p.woId),
    db.prepare(`
      INSERT INTO work_order_lines(id, branch_id, work_order_id, line_no, line_type, item_id, description, qty_m, unit_price_vnd, gross_vnd, net_vnd)
      SELECT json_extract(j.value, '$.id'), ?1, ?2,
        (SELECT COALESCE(MAX(line_no), 0) FROM work_order_lines WHERE work_order_id = ?2) + j.key + 1,
        json_extract(j.value, '$.line_type'), json_extract(j.value, '$.item_id'), json_extract(j.value, '$.description'),
        json_extract(j.value, '$.qty_m'), json_extract(j.value, '$.unit_price_vnd'),
        CAST(ROUND(json_extract(j.value, '$.qty_m') * json_extract(j.value, '$.unit_price_vnd') / 1000.0) AS INTEGER),
        CAST(ROUND(json_extract(j.value, '$.qty_m') * json_extract(j.value, '$.unit_price_vnd') / 1000.0) AS INTEGER)
      FROM json_each(?3) j`).bind(p.branchId, p.woId, L),
    recomputeTotals(db, p.woId),
    audit(db, { branchId: p.branchId, actor: p.userId, entity: 'work_order', entityId: p.woId, action: 'add_lines', changes: p.lines, now: p.now }),
  ]);
}

function recomputeTotals(db: D1, woId: string): Stmt {
  return db.prepare(`
    UPDATE work_orders SET
      labor_gross_vnd = (SELECT COALESCE(SUM(gross_vnd), 0) FROM work_order_lines WHERE work_order_id = ?1 AND status = 'active' AND line_type <> 'part'),
      parts_gross_vnd = (SELECT COALESCE(SUM(gross_vnd), 0) FROM work_order_lines WHERE work_order_id = ?1 AND status = 'active' AND line_type = 'part'),
      discount_vnd    = (SELECT COALESCE(SUM(discount_vnd), 0) FROM work_order_lines WHERE work_order_id = ?1 AND status = 'active'),
      grand_total_vnd = (SELECT COALESCE(SUM(net_vnd), 0) FROM work_order_lines WHERE work_order_id = ?1 AND status = 'active'),
      version = version + 1
    WHERE id = ?1`).bind(woId);
}

// ---------------------------------------------------------------- chuyển trạng thái (G1-01)
const TRANSITIONS = `VALUES ('received','quoted'),('received','approved'),('quoted','approved'),('approved','in_progress'),
  ('in_progress','qc'),('qc','in_progress'),('qc','delivered'),('delivered','closed')`;

export async function transition(db: D1, p: { branchId: string; userId: string; woId: string; expectedVersion: number; to: string; now: number }) {
  await runBatch(db, [
    guardNotExists(db, 'VERSION_CONFLICT', `SELECT 1 FROM work_orders WHERE id = ? AND version = ?`, p.woId, p.expectedVersion),
    guardNotExists(db, 'INVALID_TRANSITION',
      `SELECT 1 FROM work_orders w JOIN (${TRANSITIONS}) t ON t.column1 = w.status AND t.column2 = ? WHERE w.id = ?`, p.to, p.woId),
    db.prepare(`INSERT INTO work_order_events(id, branch_id, work_order_id, kind, from_value, to_value, at, by)
                SELECT ?, branch_id, id, 'status', status, ?, ?, ? FROM work_orders WHERE id = ?`)
      .bind(uuidv7(p.now), p.to, p.now, p.userId, p.woId),
    // Hoàn thành = lần đầu sang 'delivered' (giao xe). Ghi doanh thu và giá vốn vào ngày hoàn thành.
    // Phải chạy TRƯỚC câu UPDATE dưới, vì điều kiện dựa vào completed_at còn NULL.
    db.prepare(`
      INSERT INTO daily_branch_stats(branch_id, biz_date, orders_completed, rev_labor_completed_vnd, rev_parts_completed_vnd,
                                     discount_completed_vnd, cogs_completed_vnd, cogs_provisional_vnd)
      SELECT w.branch_id, ?1, 1, w.labor_gross_vnd, w.parts_gross_vnd, w.discount_vnd,
             COALESCE(c.parts_cost_vnd, 0), CASE WHEN c.cost_status = 'provisional' THEN c.parts_cost_vnd ELSE 0 END
      FROM work_orders w LEFT JOIN work_order_costs c ON c.work_order_id = w.id
      WHERE w.id = ?2 AND ?3 = 'delivered' AND w.completed_at IS NULL
      ON CONFLICT(branch_id, biz_date) DO UPDATE SET
        orders_completed = orders_completed + 1,
        rev_labor_completed_vnd = rev_labor_completed_vnd + excluded.rev_labor_completed_vnd,
        rev_parts_completed_vnd = rev_parts_completed_vnd + excluded.rev_parts_completed_vnd,
        discount_completed_vnd = discount_completed_vnd + excluded.discount_completed_vnd,
        cogs_completed_vnd = cogs_completed_vnd + excluded.cogs_completed_vnd,
        cogs_provisional_vnd = cogs_provisional_vnd + excluded.cogs_provisional_vnd`).bind(bizDate(p.now), p.woId, p.to),
    db.prepare(`
      UPDATE work_orders SET status = ?1,
        completed_at = CASE WHEN ?1 = 'delivered' AND completed_at IS NULL THEN ?2 ELSE completed_at END,
        completed_biz_date = CASE WHEN ?1 = 'delivered' AND completed_at IS NULL THEN ?3 ELSE completed_biz_date END,
        delivered_at = CASE WHEN ?1 = 'delivered' AND delivered_at IS NULL THEN ?2 ELSE delivered_at END,
        closed_at = CASE WHEN ?1 = 'closed' AND closed_at IS NULL THEN ?2 ELSE closed_at END,
        version = version + 1
      WHERE id = ?4`).bind(p.to, p.now, bizDate(p.now), p.woId),
  ]);
}

// ---------------------------------------------------------------- nhập mua (để có tồn kho và giá vốn)
export type InLine = { move_id: string; item_id: string; qty_m: number; unit_cost_vnd: number };

export async function receiveStock(db: D1, p: {
  key: string; branchId: string; userId: string; docId: string; warehouseId: string; lines: InLine[]; now: number;
  supplierInvoiceNo?: string | null; note?: string | null;
}) {
  const d = bizDate(p.now);
  const seqKey = `NK-${d.slice(0, 4)}`;
  const L = JSON.stringify(p.lines);
  return withIdempotency(db, p.key, async () => {
    const docStmt = db.prepare(`
      INSERT INTO stock_docs(id, branch_id, doc_no, doc_type, warehouse_id, supplier_invoice_no, biz_date, status, note, created_by, created_at)
      SELECT ?1, ?2, ?3 || '-' || printf('%05d', last_value), 'purchase_receipt', ?4, ?8, ?5, 'posted', ?9, ?6, ?7
      FROM sequences WHERE branch_id = ?2 AND seq_key = ?3 RETURNING doc_no`)
      .bind(p.docId, p.branchId, seqKey, p.warehouseId, d, p.userId, p.now, p.supplierInvoiceNo ?? null, p.note ?? null);
    const stmts = [
      idem(db, p.key, p.branchId, p.userId, 'stock.receive', p.docId, p.now),
      guardNotExists(db, 'EMPTY_LINES', `SELECT 1 FROM json_each(?)`, L),
      guardExists(db, 'DUPLICATE_ITEM', `SELECT 1 FROM json_each(?) GROUP BY json_extract(value, '$.item_id') HAVING COUNT(*) > 1`, L),
      // Chỉ nhập mặt hàng của chính chi nhánh, đang dùng, có quản lý tồn (phụ tùng, vật tư).
      guardExists(db, 'ITEM_NOT_STOCKABLE', `
        SELECT 1 FROM json_each(?1) j LEFT JOIN items i ON i.id = json_extract(j.value, '$.item_id')
        WHERE i.id IS NULL OR i.branch_id <> ?2 OR i.active = 0 OR i.track_stock = 0 OR i.item_type NOT IN ('part', 'consumable')`, L, p.branchId),
      // Lần đầu nhập mặt hàng vào kho này: tạo dòng tồn, cờ cho tồn âm lấy theo mặt hàng.
      db.prepare(`
        INSERT INTO stock_balances(warehouse_id, item_id, branch_id, allow_negative)
        SELECT ?1, i.id, i.branch_id, i.allow_negative FROM json_each(?2) j JOIN items i ON i.id = json_extract(j.value, '$.item_id')
        WHERE 1
        ON CONFLICT(warehouse_id, item_id) DO NOTHING`).bind(p.warehouseId, L),
      nextSeq(db, p.branchId, seqKey),
      docStmt,
      db.prepare(`
        INSERT INTO stock_moves(id, branch_id, stock_doc_id, warehouse_id, item_id, qty_delta_m, total_cost_vnd, cost_status, costing_method, biz_date)
        SELECT json_extract(value, '$.move_id'), ?, ?, ?, json_extract(value, '$.item_id'), json_extract(value, '$.qty_m'),
          CAST(ROUND(json_extract(value, '$.qty_m') * json_extract(value, '$.unit_cost_vnd') / 1000.0) AS INTEGER), 'final', 'moving_avg', ?
        FROM json_each(?)`).bind(p.branchId, p.docId, p.warehouseId, d, L),
      db.prepare(`
        UPDATE stock_balances AS b SET
          on_hand_qty_m = b.on_hand_qty_m + m.qty_delta_m,
          on_hand_value_vnd = b.on_hand_value_vnd + m.total_cost_vnd,
          last_unit_cost_vnd = CAST(ROUND(m.total_cost_vnd * 1000.0 / m.qty_delta_m) AS INTEGER),
          version = b.version + 1
        FROM stock_moves m WHERE m.stock_doc_id = ? AND b.warehouse_id = m.warehouse_id AND b.item_id = m.item_id`).bind(p.docId),
      guardExists(db, 'NO_STOCK_ROW', `SELECT 1 FROM stock_moves m LEFT JOIN stock_balances b ON b.warehouse_id = m.warehouse_id AND b.item_id = m.item_id
                                      WHERE m.stock_doc_id = ? AND b.item_id IS NULL`, p.docId),
      db.prepare(`INSERT INTO daily_branch_stats(branch_id, biz_date, stock_in_value_vnd)
                  SELECT ?, ?, SUM(total_cost_vnd) FROM stock_moves WHERE stock_doc_id = ?
                  ON CONFLICT(branch_id, biz_date) DO UPDATE SET stock_in_value_vnd = stock_in_value_vnd + excluded.stock_in_value_vnd`)
        .bind(p.branchId, d, p.docId),
      audit(db, { branchId: p.branchId, actor: p.userId, entity: 'stock_doc', entityId: p.docId, action: 'receive', changes: p.lines, sensitive: true, now: p.now }),
    ];
    const res = await runBatch(db, stmts);
    return { docId: p.docId, docNo: res[stmts.indexOf(docStmt)].results[0].doc_no as string };
  });
}

// ---------------------------------------------------------------- 2.2 Xuất kho theo lệnh (bình quân tức thời)
export type OutLine = { move_id: string; line_id: string; item_id: string; qty_m: number };

export async function issueStock(db: D1, p: { key: string; branchId: string; userId: string; woId: string; docId: string; warehouseId: string; lines: OutLine[]; now: number }) {
  const d = bizDate(p.now);
  const seqKey = `XK-${d.slice(0, 4)}`;
  const L = JSON.stringify(p.lines);
  return withIdempotency(db, p.key, async () => {
    const res = await runBatch(db, [
      idem(db, p.key, p.branchId, p.userId, 'stock.issue', p.docId, p.now),
      guardNotExists(db, 'EMPTY_LINES', `SELECT 1 FROM json_each(?)`, L),
      guardNotExists(db, 'ORDER_NOT_EDITABLE',
        `SELECT 1 FROM work_orders WHERE id = ? AND locked_at IS NULL AND status IN ('approved','in_progress','qc')`, p.woId),
      guardExists(db, 'ISSUE_EXCEEDS_LINE', `
        SELECT 1 FROM json_each(?1) j LEFT JOIN work_order_lines l ON l.id = json_extract(j.value, '$.line_id')
        WHERE l.id IS NULL OR l.work_order_id <> ?2 OR l.status <> 'active' OR l.line_type <> 'part'
           OR l.item_id IS NOT json_extract(j.value, '$.item_id')
           OR l.issued_qty_m + json_extract(j.value, '$.qty_m') > l.qty_m`, L, p.woId),
      guardExists(db, 'NO_STOCK_ROW', `
        SELECT 1 FROM json_each(?1) j LEFT JOIN stock_balances b ON b.warehouse_id = ?2 AND b.item_id = json_extract(j.value, '$.item_id')
        WHERE b.item_id IS NULL`, L, p.warehouseId),
      guardExists(db, 'DUPLICATE_ITEM', `SELECT 1 FROM json_each(?) GROUP BY json_extract(value, '$.item_id') HAVING COUNT(*) > 1`, L),
      nextSeq(db, p.branchId, seqKey),
      db.prepare(`INSERT INTO stock_docs(id, branch_id, doc_no, doc_type, warehouse_id, work_order_id, biz_date, status, created_by, created_at)
                  SELECT ?1, ?2, ?3 || '-' || printf('%05d', last_value), 'order_issue', ?4, ?5, ?6, 'posted', ?7, ?8
                  FROM sequences WHERE branch_id = ?2 AND seq_key = ?3`)
        .bind(p.docId, p.branchId, seqKey, p.warehouseId, p.woId, d, p.userId, p.now),
      // Giá vốn tính từ số dư ngay trong câu: không có khoảng hở giữa đọc và ghi.
      db.prepare(`
        INSERT INTO stock_moves(id, branch_id, stock_doc_id, warehouse_id, item_id, qty_delta_m, total_cost_vnd,
                                cost_status, costing_method, work_order_id, work_order_line_id, biz_date)
        SELECT q.move_id, ?1, ?2, ?3, b.item_id, -q.qty,
          CASE
            WHEN b.on_hand_qty_m <= 0 THEN CAST(ROUND(b.last_unit_cost_vnd * q.qty / 1000.0) AS INTEGER)
            WHEN q.qty >= b.on_hand_qty_m THEN b.on_hand_value_vnd
                 + CAST(ROUND(b.last_unit_cost_vnd * (q.qty - b.on_hand_qty_m) / 1000.0) AS INTEGER)
            ELSE CAST(ROUND(b.on_hand_value_vnd * 1.0 * q.qty / b.on_hand_qty_m) AS INTEGER)
          END,
          CASE WHEN b.on_hand_qty_m >= q.qty THEN 'final' ELSE 'provisional' END,
          'moving_avg', ?4, q.line_id, ?5
        FROM (SELECT json_extract(value, '$.move_id') AS move_id, json_extract(value, '$.line_id') AS line_id,
                     json_extract(value, '$.item_id') AS item_id, json_extract(value, '$.qty_m') AS qty
              FROM json_each(?6)) q
        JOIN stock_balances b ON b.warehouse_id = ?3 AND b.item_id = q.item_id`)
        .bind(p.branchId, p.docId, p.warehouseId, p.woId, d, L),
      // CHECK stock_not_negative chặn xuất quá tồn khi item không cho tồn âm.
      db.prepare(`
        UPDATE stock_balances AS b SET
          on_hand_qty_m = b.on_hand_qty_m + m.qty_delta_m,
          on_hand_value_vnd = b.on_hand_value_vnd - m.total_cost_vnd,
          version = b.version + 1
        FROM stock_moves m WHERE m.stock_doc_id = ? AND b.warehouse_id = m.warehouse_id AND b.item_id = m.item_id`).bind(p.docId),
      db.prepare(`
        UPDATE work_order_lines AS l SET issued_qty_m = l.issued_qty_m - m.qty_delta_m, version = l.version + 1
        FROM stock_moves m WHERE m.stock_doc_id = ? AND m.work_order_line_id = l.id`).bind(p.docId),
      db.prepare(`
        INSERT INTO work_order_costs(work_order_id, branch_id, parts_cost_vnd, cost_status, updated_at)
        SELECT ?1, ?2, SUM(total_cost_vnd), CASE WHEN SUM(cost_status = 'provisional') > 0 THEN 'provisional' ELSE 'final' END, ?3
        FROM stock_moves WHERE stock_doc_id = ?4
        ON CONFLICT(work_order_id) DO UPDATE SET
          parts_cost_vnd = parts_cost_vnd + excluded.parts_cost_vnd,
          cost_status = CASE WHEN excluded.cost_status = 'provisional' THEN 'provisional' ELSE cost_status END,
          updated_at = excluded.updated_at`).bind(p.woId, p.branchId, p.now, p.docId),
      db.prepare(`INSERT INTO daily_branch_stats(branch_id, biz_date, stock_out_value_vnd)
                  SELECT ?, ?, SUM(total_cost_vnd) FROM stock_moves WHERE stock_doc_id = ?
                  ON CONFLICT(branch_id, biz_date) DO UPDATE SET stock_out_value_vnd = stock_out_value_vnd + excluded.stock_out_value_vnd`)
        .bind(p.branchId, d, p.docId),
      audit(db, { branchId: p.branchId, actor: p.userId, entity: 'stock_doc', entityId: p.docId, action: 'issue', changes: p.lines, sensitive: true, now: p.now }),
    ]);
    return { docId: p.docId, statements: res.length };
  });
}

// ---------------------------------------------------------------- 2.3 Hủy lệnh, hoàn kho theo giá vốn gốc
export async function cancelWorkOrder(db: D1, p: {
  key: string; branchId: string; userId: string; woId: string; expectedVersion: number;
  paidAction: 'refund' | 'advance' | null; reasonCode: string; reason: string; returnDocId: string; refundPaymentId: string; now: number;
}) {
  const d = bizDate(p.now);
  const y = d.slice(0, 4);
  return withIdempotency(db, p.key, async () => {
    await runBatch(db, [
      idem(db, p.key, p.branchId, p.userId, 'wo.cancel', p.woId, p.now),
      guardNotExists(db, 'ORDER_NOT_CANCELLABLE',
        `SELECT 1 FROM work_orders WHERE id = ? AND version = ? AND locked_at IS NULL AND status IN ${EDITABLE}`, p.woId, p.expectedVersion),
      guardExists(db, 'INVOICE_ISSUED', `SELECT 1 FROM invoices WHERE work_order_id = ? AND status IN ('issuing','issued')`, p.woId),
      guardExists(db, 'PAID_NEEDS_ACTION', `SELECT 1 FROM work_orders WHERE id = ? AND paid_vnd > 0 AND ? IS NULL`, p.woId, p.paidAction),

      // Phiếu nhập hoàn kho, chỉ tạo khi lệnh có xuất ròng
      nextSeqIf(db, p.branchId, `NK-${y}`,
        `EXISTS (SELECT 1 FROM stock_moves WHERE work_order_id = ? GROUP BY work_order_line_id HAVING SUM(qty_delta_m) < 0)`, p.woId),
      db.prepare(`
        INSERT INTO stock_docs(id, branch_id, doc_no, doc_type, warehouse_id, work_order_id, biz_date, status, created_by, created_at)
        SELECT ?1, ?2, 'NK-' || ?3 || '-' || printf('%05d', s.last_value), 'order_return',
               (SELECT warehouse_id FROM stock_moves WHERE work_order_id = ?4 LIMIT 1), ?4, ?5, 'posted', ?6, ?7
        FROM sequences s WHERE s.branch_id = ?2 AND s.seq_key = 'NK-' || ?3
          AND EXISTS (SELECT 1 FROM stock_moves WHERE work_order_id = ?4 GROUP BY work_order_line_id HAVING SUM(qty_delta_m) < 0)`)
        .bind(p.returnDocId, p.branchId, y, p.woId, d, p.userId, p.now),
      db.prepare(`
        INSERT INTO stock_moves(id, branch_id, stock_doc_id, warehouse_id, item_id, qty_delta_m, total_cost_vnd,
                                cost_status, costing_method, work_order_id, work_order_line_id, biz_date)
        SELECT lower(hex(randomblob(16))), ?1, ?2, warehouse_id, item_id, -SUM(qty_delta_m),
               -- total_cost_vnd luôn dương; chiều đi theo dấu qty. Giá vốn xuất ròng = xuất trừ đã trả.
               SUM(CASE WHEN qty_delta_m < 0 THEN total_cost_vnd ELSE -total_cost_vnd END),
               CASE WHEN SUM(cost_status = 'provisional') > 0 THEN 'provisional' ELSE 'final' END,
               MAX(costing_method), ?3, work_order_line_id, ?4
        FROM stock_moves WHERE work_order_id = ?3
        GROUP BY warehouse_id, item_id, work_order_line_id HAVING SUM(qty_delta_m) < 0`)
        .bind(p.branchId, p.returnDocId, p.woId, d),
      db.prepare(`
        UPDATE stock_balances AS b SET
          on_hand_qty_m = b.on_hand_qty_m + m.qty, on_hand_value_vnd = b.on_hand_value_vnd + m.cost, version = b.version + 1
        FROM (SELECT warehouse_id, item_id, SUM(qty_delta_m) AS qty, SUM(total_cost_vnd) AS cost
              FROM stock_moves WHERE stock_doc_id = ? GROUP BY warehouse_id, item_id) m
        WHERE b.warehouse_id = m.warehouse_id AND b.item_id = m.item_id`).bind(p.returnDocId),

      // Tiền đã thu: hoàn (phiếu chi) hoặc chuyển thành tiền khách trả trước.
      // Hoàn tiền mặt lấy từ két của người hủy: cash.require_session bật thì phải có ca đang mở.
      guardExists(db, 'NO_OPEN_SESSION', `
        SELECT 1 FROM work_orders WHERE id = ?1 AND paid_vnd > 0 AND ?2 = 'refund'
          AND ${requireSessionSql(3, 4)} = 1 AND NOT EXISTS (${openSessionSql(3, 5)})`, p.woId, p.paidAction, p.branchId, d, p.userId),
      nextSeqIf(db, p.branchId, `PC-${y}`, `? = 'refund' AND EXISTS (SELECT 1 FROM work_orders WHERE id = ? AND paid_vnd > 0)`, p.paidAction, p.woId),
      db.prepare(`
        INSERT INTO payments(id, branch_id, doc_no, direction, method, amount_vnd, biz_date, at, status, cash_session_id)
        SELECT ?1, ?2, 'PC-' || ?3 || '-' || printf('%05d', s.last_value), 'out', 'cash', w.paid_vnd, ?4, ?5, 'posted', (${openSessionSql(2, 8)})
        FROM work_orders w, sequences s
        WHERE w.id = ?6 AND w.paid_vnd > 0 AND ?7 = 'refund' AND s.branch_id = ?2 AND s.seq_key = 'PC-' || ?3`)
        .bind(p.refundPaymentId, p.branchId, y, d, p.now, p.woId, p.paidAction, p.userId),
      db.prepare(`
        INSERT INTO payment_allocations(id, branch_id, payment_id, target, work_order_id, amount_vnd)
        SELECT lower(hex(randomblob(16))), ?1, ?2, 'work_order', id, -paid_vnd FROM work_orders
        WHERE id = ?3 AND paid_vnd > 0 AND ?4 = 'refund'`).bind(p.branchId, p.refundPaymentId, p.woId, p.paidAction),
      db.prepare(`
        INSERT INTO payment_allocations(id, branch_id, payment_id, target, work_order_id, amount_vnd)
        SELECT lower(hex(randomblob(16))), ?1, payment_id, x.target, CASE WHEN x.target = 'work_order' THEN ?2 END, x.sign * amt
        FROM (SELECT payment_id, SUM(amount_vnd) AS amt FROM payment_allocations
              WHERE work_order_id = ?2 AND target = 'work_order' GROUP BY payment_id HAVING SUM(amount_vnd) > 0) a,
             (SELECT 'work_order' AS target, -1 AS sign UNION ALL SELECT 'advance', 1) x
        WHERE ?3 = 'advance'`).bind(p.branchId, p.woId, p.paidAction),
      db.prepare(`
        INSERT INTO daily_branch_stats(branch_id, biz_date, orders_cancelled, refund_out_vnd, stock_out_value_vnd)
        SELECT ?1, ?2, 1,
          COALESCE((SELECT amount_vnd FROM payments WHERE id = ?3), 0),
          -COALESCE((SELECT SUM(total_cost_vnd) FROM stock_moves WHERE stock_doc_id = ?4), 0)
        WHERE 1
        ON CONFLICT(branch_id, biz_date) DO UPDATE SET
          orders_cancelled = orders_cancelled + 1,
          refund_out_vnd = refund_out_vnd + excluded.refund_out_vnd,
          stock_out_value_vnd = stock_out_value_vnd + excluded.stock_out_value_vnd`)
        .bind(p.branchId, d, p.refundPaymentId, p.returnDocId),

      db.prepare(`UPDATE work_order_lines SET status = 'cancelled', issued_qty_m = 0, version = version + 1 WHERE work_order_id = ? AND status = 'active'`).bind(p.woId),
      db.prepare(`UPDATE work_order_costs SET parts_cost_vnd = 0, updated_at = ? WHERE work_order_id = ?`).bind(p.now, p.woId),
      db.prepare(`UPDATE payment_intents SET status = 'void' WHERE work_order_id = ? AND status = 'pending'`).bind(p.woId),
      db.prepare(`INSERT INTO work_order_events(id, branch_id, work_order_id, kind, from_value, to_value, at, by, reason)
                  SELECT ?, branch_id, id, 'status', status, 'cancelled', ?, ?, ? FROM work_orders WHERE id = ?`)
        .bind(uuidv7(p.now), p.now, p.userId, `${p.reasonCode}: ${p.reason}`, p.woId),
      db.prepare(`
        UPDATE work_orders SET status = 'cancelled', cancelled_at = ?1, cancelled_by = ?2, cancel_reason_code = ?3, cancel_reason = ?4,
          paid_vnd = 0, payment_status = 'unpaid',
          labor_gross_vnd = 0, parts_gross_vnd = 0, discount_vnd = 0, grand_total_vnd = 0, version = version + 1
        WHERE id = ?5`).bind(p.now, p.userId, p.reasonCode, p.reason, p.woId),
      audit(db, { branchId: p.branchId, actor: p.userId, entity: 'work_order', entityId: p.woId, action: 'cancel', reason: p.reason, changes: { paidAction: p.paidAction }, now: p.now }),
    ]);
    return { cancelled: true };
  });
}

// ---------------------------------------------------------------- 2.4 QR: tạo mã, nhận webhook, khóa lệnh
// Cộng tiền vào lệnh (tối đa bằng số còn phải thu), đủ thì khóa theo lock_policy và ghi sự kiện khóa. Dùng chung cho QR và tiền mặt.
function applyPaymentToOrder(db: D1, p: { woId: string; amount: number; by: string; now: number }): Stmt[] {
  return [
    // SQLite tính mọi vế phải của SET trên giá trị CŨ của dòng.
    db.prepare(`
      UPDATE work_orders SET
        paid_vnd = paid_vnd + MIN(?1, grand_total_vnd - paid_vnd),
        payment_status = CASE WHEN paid_vnd + ?1 >= grand_total_vnd THEN 'paid' ELSE 'partial' END,
        fully_paid_at = CASE WHEN fully_paid_at IS NULL AND paid_vnd + ?1 >= grand_total_vnd THEN ?2 ELSE fully_paid_at END,
        locked_at = CASE WHEN locked_at IS NULL AND lock_policy IN ('invoice_or_paid','paid') AND paid_vnd + ?1 >= grand_total_vnd THEN ?2 ELSE locked_at END,
        lock_reason = CASE WHEN locked_at IS NULL AND lock_policy IN ('invoice_or_paid','paid') AND paid_vnd + ?1 >= grand_total_vnd THEN 'paid' ELSE lock_reason END,
        version = version + 1
      WHERE id = ?3`).bind(p.amount, p.now, p.woId),
    db.prepare(`INSERT INTO work_order_events(id, branch_id, work_order_id, kind, to_value, at, by)
                SELECT ?, branch_id, id, 'lock', 'paid', ?, ? FROM work_orders WHERE id = ? AND locked_at = ?`)
      .bind(uuidv7(p.now), p.now, p.by, p.woId, p.now),
  ];
}

export async function createPaymentIntent(db: D1, p: { branchId: string; woId: string; intentId: string; transferRef: string; ttlMs: number; now: number }) {
  await runBatch(db, [
    guardNotExists(db, 'ORDER_NOT_EDITABLE',
      `SELECT 1 FROM work_orders WHERE id = ? AND status <> 'cancelled' AND grand_total_vnd > paid_vnd`, p.woId),
    db.prepare(`
      INSERT INTO payment_intents(id, branch_id, work_order_id, amount_vnd, order_version, transfer_ref, expires_at, status)
      SELECT ?, branch_id, id, grand_total_vnd - paid_vnd, version, ?, ?, 'pending' FROM work_orders WHERE id = ?`)
      .bind(p.intentId, p.transferRef, p.now + p.ttlMs, p.woId),
  ]);
}

export async function postQrPayment(db: D1, p: {
  branchId: string; provider: string; providerTxnId: string; amount: number; memo: string; intentId: string; woId: string;
  bankTxnId: string; paymentId: string; now: number;
}) {
  const d = bizDate(p.now);
  const seqKey = `PT-${d.slice(0, 4)}`;
  const A = p.amount;
  return runBatch(db, [
    db.prepare(`INSERT INTO bank_transactions(id, branch_id, provider, provider_txn_id, amount_vnd, memo, txn_at, match_status, payment_intent_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'auto', ?)`).bind(p.bankTxnId, p.branchId, p.provider, p.providerTxnId, A, p.memo, p.now, p.intentId),
    guardNotExists(db, 'INTENT_STALE', `
      SELECT 1 FROM payment_intents i JOIN work_orders w ON w.id = i.work_order_id
      WHERE i.id = ? AND i.work_order_id = ? AND i.status = 'pending' AND i.expires_at > ? AND i.order_version = w.version
        AND w.status <> 'cancelled'`, p.intentId, p.woId, p.now),
    nextSeq(db, p.branchId, seqKey),
    db.prepare(`INSERT INTO payments(id, branch_id, doc_no, direction, method, amount_vnd, biz_date, at, bank_txn_id, status)
                SELECT ?1, ?2, ?3 || '-' || printf('%05d', last_value), 'in', 'qr', ?4, ?5, ?6, ?7, 'posted'
                FROM sequences WHERE branch_id = ?2 AND seq_key = ?3`)
      .bind(p.paymentId, p.branchId, seqKey, A, d, p.now, p.bankTxnId),
    // Phần vượt số còn phải thu thành tiền trả trước
    db.prepare(`
      INSERT INTO payment_allocations(id, branch_id, payment_id, target, work_order_id, amount_vnd)
      SELECT lower(hex(randomblob(16))), ?1, ?2, 'work_order', id, MIN(?3, grand_total_vnd - paid_vnd) FROM work_orders WHERE id = ?4
      UNION ALL
      SELECT lower(hex(randomblob(16))), ?1, ?2, 'advance', NULL, ?3 - (grand_total_vnd - paid_vnd) FROM work_orders
      WHERE id = ?4 AND ?3 > grand_total_vnd - paid_vnd`).bind(p.branchId, p.paymentId, A, p.woId),
    ...applyPaymentToOrder(db, { woId: p.woId, amount: A, by: 'system', now: p.now }),
    db.prepare(`UPDATE payment_intents SET status = 'matched', bank_txn_id = ? WHERE id = ?`).bind(p.bankTxnId, p.intentId),
    db.prepare(`INSERT INTO daily_branch_stats(branch_id, biz_date, collected_vnd, qr_in_vnd) VALUES (?, ?, ?, ?)
                ON CONFLICT(branch_id, biz_date) DO UPDATE SET collected_vnd = collected_vnd + excluded.collected_vnd, qr_in_vnd = qr_in_vnd + excluded.qr_in_vnd`)
      .bind(p.branchId, d, A, A),
    audit(db, { branchId: p.branchId, actor: 'system', entity: 'payment', entityId: p.paymentId, action: 'qr_in', changes: { amount: A, intent: p.intentId }, now: p.now }),
  ]);
}

// ---------------------------------------------------------------- 2.5 Thu tiền mặt theo lệnh (phiếu thu PT)
// Khác QR: thu ngân cầm tiền nên phần dư là tiền thối, không thành tiền trả trước. Thu quá số còn phải thu bị chặn.
export async function postCashPayment(db: D1, p: { key: string; branchId: string; userId: string; woId: string; paymentId: string; amount: number; note?: string | null; now: number }) {
  const d = bizDate(p.now);
  const seqKey = `PT-${d.slice(0, 4)}`;
  const A = p.amount;
  return withIdempotency(db, p.key, async () => {
    // Phiếu gắn vào ca đang mở của người thu (nếu có). cash.require_session bật mà chưa mở ca thì guard chặn trước.
    const payStmt = db.prepare(`
      INSERT INTO payments(id, branch_id, doc_no, direction, method, amount_vnd, biz_date, at, status, note, cash_session_id)
      SELECT ?1, ?2, ?3 || '-' || printf('%05d', last_value), 'in', 'cash', ?4, ?5, ?6, 'posted', ?7, (${openSessionSql(2, 8)})
      FROM sequences WHERE branch_id = ?2 AND seq_key = ?3 RETURNING doc_no, cash_session_id`)
      .bind(p.paymentId, p.branchId, seqKey, A, d, p.now, p.note ?? null, p.userId);
    const stmts = [
      idem(db, p.key, p.branchId, p.userId, 'pay.cash', p.paymentId, p.now),
      guardExists(db, 'NO_OPEN_SESSION', `SELECT 1 WHERE ${requireSessionSql(1, 2)} = 1 AND NOT EXISTS (${openSessionSql(1, 3)})`, p.branchId, d, p.userId),
      guardNotExists(db, 'ORDER_NOT_PAYABLE',
        `SELECT 1 FROM work_orders WHERE id = ? AND branch_id = ? AND status <> 'cancelled' AND grand_total_vnd > paid_vnd`, p.woId, p.branchId),
      guardExists(db, 'AMOUNT_EXCEEDS_DUE', `SELECT 1 FROM work_orders WHERE id = ? AND ? > grand_total_vnd - paid_vnd`, p.woId, A),
      nextSeq(db, p.branchId, seqKey),
      payStmt,
      db.prepare(`INSERT INTO payment_allocations(id, branch_id, payment_id, target, work_order_id, amount_vnd) VALUES (?, ?, ?, 'work_order', ?, ?)`)
        .bind(uuidv7(p.now), p.branchId, p.paymentId, p.woId, A),
      ...applyPaymentToOrder(db, { woId: p.woId, amount: A, by: p.userId, now: p.now }),
      // Số còn phải thu đã đổi: mã QR đang chờ không còn đúng. Khách lỡ chuyển khoản thì giao dịch vào hàng chờ ghép tay.
      db.prepare(`UPDATE payment_intents SET status = 'void' WHERE work_order_id = ? AND status = 'pending'`).bind(p.woId),
      db.prepare(`INSERT INTO daily_branch_stats(branch_id, biz_date, collected_vnd, cash_in_vnd) VALUES (?, ?, ?, ?)
                  ON CONFLICT(branch_id, biz_date) DO UPDATE SET collected_vnd = collected_vnd + excluded.collected_vnd, cash_in_vnd = cash_in_vnd + excluded.cash_in_vnd`)
        .bind(p.branchId, d, A, A),
      // Ghi vào nhật ký của lệnh để ai xem lệnh cũng thấy ai thu, bao nhiêu.
      audit(db, { branchId: p.branchId, actor: p.userId, entity: 'work_order', entityId: p.woId, action: 'cash_in',
        changes: { payment_id: p.paymentId, amount_vnd: A, note: p.note ?? null }, now: p.now }),
    ];
    const res = await runBatch(db, stmts);
    const r = res[stmts.indexOf(payStmt)].results[0];
    return { paymentId: p.paymentId, docNo: r.doc_no as string, cashSessionId: (r.cash_session_id ?? null) as string | null };
  });
}

// Dự phòng khi guard INTENT_STALE hỏng: tiền không bao giờ mất dấu, thu ngân ghép tay.
export async function recordUnmatchedBankTxn(db: D1, p: { branchId: string; provider: string; providerTxnId: string; amount: number; memo: string; bankTxnId: string; now: number }) {
  return runBatch(db, [
    db.prepare(`INSERT INTO bank_transactions(id, branch_id, provider, provider_txn_id, amount_vnd, memo, txn_at, match_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'unmatched')`).bind(p.bankTxnId, p.branchId, p.provider, p.providerTxnId, p.amount, p.memo, p.now),
  ]);
}

// Mở lại lệnh đã khóa (G1-03): chỉ đặt locked_at = NULL; trigger chặn đổi tiền trong cùng câu.
export async function reopenWorkOrder(db: D1, p: { branchId: string; userId: string; woId: string; reason: string; now: number }) {
  await runBatch(db, [
    guardExists(db, 'INVOICE_ISSUED', `SELECT 1 FROM invoices WHERE work_order_id = ? AND status IN ('issuing','issued')`, p.woId),
    db.prepare(`INSERT INTO work_order_events(id, branch_id, work_order_id, kind, from_value, to_value, at, by, reason)
                SELECT ?, branch_id, id, 'unlock', lock_reason, NULL, ?, ?, ? FROM work_orders WHERE id = ? AND locked_at IS NOT NULL`)
      .bind(uuidv7(p.now), p.now, p.userId, p.reason, p.woId),
    db.prepare(`UPDATE work_orders SET locked_at = NULL, lock_reason = NULL, reopen_count = reopen_count + 1, version = version + 1 WHERE id = ?`).bind(p.woId),
    audit(db, { branchId: p.branchId, actor: p.userId, entity: 'work_order', entityId: p.woId, action: 'reopen', reason: p.reason, now: p.now }),
  ]);
}

// ---------------------------------------------------------------- 2.6 Ca thu ngân: mở ca, chốt ca theo mệnh giá
export async function openCashSession(db: D1, p: { key: string; branchId: string; userId: string; sessionId: string; denominations: Denominations; note?: string | null; now: number }) {
  const d = bizDate(p.now);
  const open = countDenominations(p.denominations);
  return withIdempotency(db, p.key, async () => {
    await runBatch(db, [
      idem(db, p.key, p.branchId, p.userId, 'cash.open', p.sessionId, p.now),
      guardExists(db, 'SESSION_ALREADY_OPEN', openSessionSql(1, 2), p.branchId, p.userId),
      db.prepare(`INSERT INTO cash_sessions(id, branch_id, holder_id, opened_at, opening_float_vnd, opening_denominations_json, biz_date, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`).bind(p.sessionId, p.branchId, p.userId, p.now, open.total, open.json, d),
      audit(db, { branchId: p.branchId, actor: p.userId, entity: 'cash_session', entityId: p.sessionId, action: 'open',
        changes: { opening_float_vnd: open.total, denominations: JSON.parse(open.json), note: p.note ?? null }, now: p.now }),
    ]);
    return { sessionId: p.sessionId };
  });
}

// Chốt ca: số dự kiến và chênh lệch tính ngay trong câu UPDATE từ sổ phiếu; trigger cs_close_balance kiểm lại.
// Người chốt có thể là chính thu ngân hoặc quản lý (route kiểm quyền). Chênh lệch vượt ngưỡng phải có lý do.
export async function closeCashSession(db: D1, p: {
  key: string; branchId: string; userId: string; sessionId: string; denominations: Denominations; varianceReason?: string | null; now: number;
}) {
  const d = bizDate(p.now);
  const counted = countDenominations(p.denominations);
  const reason = p.varianceReason?.trim() || null;
  return withIdempotency(db, p.key, async () => {
    await runBatch(db, [
      idem(db, p.key, p.branchId, p.userId, 'cash.close', p.sessionId, p.now),
      guardNotExists(db, 'SESSION_NOT_OPEN', `SELECT 1 FROM cash_sessions WHERE id = ? AND branch_id = ? AND status = 'open'`, p.sessionId, p.branchId),
      guardExists(db, 'VARIANCE_REASON_REQUIRED', `
        SELECT 1 FROM cash_sessions s WHERE s.id = ?1 AND ?2 IS NULL AND ABS(?3 - ${SESSION_BALANCE}) > ${varianceThresholdSql(4, 5)}`,
        p.sessionId, reason, counted.total, p.branchId, d),
      db.prepare(`
        UPDATE cash_sessions AS s SET status = 'closed', closed_at = ?2, closed_by = ?3, counted_vnd = ?4, denominations_json = ?5,
          expected_vnd = ${SESSION_BALANCE}, variance_vnd = ?4 - ${SESSION_BALANCE}, variance_reason = ?6
        WHERE s.id = ?1 AND s.status = 'open'`).bind(p.sessionId, p.now, p.userId, counted.total, counted.json, reason),
      audit(db, { branchId: p.branchId, actor: p.userId, entity: 'cash_session', entityId: p.sessionId, action: 'close',
        changes: { counted_vnd: counted.total, denominations: JSON.parse(counted.json) }, reason: reason ?? undefined, now: p.now }),
    ]);
    return { sessionId: p.sessionId };
  });
}
