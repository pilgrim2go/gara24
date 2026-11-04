// Kiểu tối thiểu để file chạy được cả trên Node (strip-types) lẫn Workers.
export type D1 = {
  prepare(sql: string): { bind(...args: unknown[]): Stmt; first<T = any>(): Promise<T | null>; all<T = any>(): Promise<{ results: T[] }> };
  batch(stmts: Stmt[]): Promise<Array<{ results: any[]; meta: any }>>;
};
export type Stmt = { bind(...args: unknown[]): Stmt; first<T = any>(): Promise<T | null>; all<T = any>(): Promise<{ results: T[] }>; run(): Promise<any> };

export class BizError extends Error {
  code: string;
  raw: string;
  constructor(code: string, raw: string) {
    super(code);
    this.code = code;
    this.raw = raw;
  }
}

// UUIDv7: có thứ tự theo thời gian, sinh được khi mất mạng.
export function uuidv7(now = Date.now()): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let t = BigInt(now);
  for (let i = 5; i >= 0; i--) { b[i] = Number(t & 0xffn); t >>= 8n; }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Ngày nghiệp vụ theo giờ Việt Nam (UTC+7, không có giờ mùa hè).
export function bizDate(nowMs: number): string {
  return new Date(nowMs + 7 * 3600_000).toISOString().slice(0, 10);
}

// Ánh xạ lỗi SQLite/D1 thành mã nghiệp vụ. Thứ tự quan trọng: mã guard/trigger trước, ràng buộc sau.
const CONSTRAINT_CODES: Array<[RegExp, string]> = [
  [/UNIQUE constraint failed: idempotency_keys\.key/, 'DUPLICATE_REQUEST'],
  [/UNIQUE constraint failed: bank_transactions\.provider, bank_transactions\.provider_txn_id/, 'DUPLICATE_BANK_TXN'],
  [/UNIQUE constraint failed: work_orders\.id/, 'DUPLICATE_REQUEST'],
  [/stock_not_negative/, 'INSUFFICIENT_STOCK'],
  [/issued_within_line/, 'ISSUE_EXCEEDS_LINE'],
  [/move_cost_non_negative/, 'NEGATIVE_MOVE_COST'],
  [/NOT NULL constraint failed: work_orders\.lock_policy/, 'SETTING_MISSING'],
  [/FOREIGN KEY constraint failed/, 'FOREIGN_KEY'],
];

export function toBizError(e: unknown): BizError {
  const raw = String((e as any)?.message ?? e) + ' ' + String((e as any)?.cause?.message ?? '');
  const m = raw.match(/(?:GUARD|INV):([A-Z_]+)/);
  if (m) return new BizError(m[1], raw);
  for (const [re, code] of CONSTRAINT_CODES) if (re.test(raw)) return new BizError(code, raw);
  return new BizError('DB_ERROR', raw);
}

export async function runBatch(db: D1, stmts: Stmt[]) {
  try {
    return await db.batch(stmts);
  } catch (e) {
    throw toBizError(e);
  }
}

// Câu guard: điều kiện SAI thì chèn mã vào _guard và trigger hủy cả batch.
// Mã lỗi nhúng thẳng vào SQL (đã kiểm định dạng) để tham số của existsSql đánh số từ ?1, không lệch chỉ số.
function guardCode(code: string): string {
  if (!/^[A-Z_]+$/.test(code)) throw new Error(`mã guard không hợp lệ: ${code}`);
  return `'${code}'`;
}
export function guardNotExists(db: D1, code: string, existsSql: string, ...args: unknown[]): Stmt {
  return db.prepare(`INSERT INTO _guard(code) SELECT ${guardCode(code)} WHERE NOT EXISTS (${existsSql})`).bind(...args);
}
export function guardExists(db: D1, code: string, existsSql: string, ...args: unknown[]): Stmt {
  return db.prepare(`INSERT INTO _guard(code) SELECT ${guardCode(code)} WHERE EXISTS (${existsSql})`).bind(...args);
}

export function audit(db: D1, a: { branchId: string; actor: string; entity: string; entityId: string; action: string; changes?: unknown; sensitive?: boolean; reason?: string; now: number }): Stmt {
  return db
    .prepare(`INSERT INTO audit_log(id, branch_id, at, actor_id, entity, entity_id, action, changes_json, sensitive, reason)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(uuidv7(a.now), a.branchId, a.now, a.actor, a.entity, a.entityId, a.action,
      a.changes === undefined ? null : JSON.stringify(a.changes), a.sensitive ? 1 : 0, a.reason ?? null);
}

export function nextSeq(db: D1, branchId: string, seqKey: string): Stmt {
  return db
    .prepare(`INSERT INTO sequences(branch_id, seq_key, last_value) VALUES (?, ?, 1)
              ON CONFLICT(branch_id, seq_key) DO UPDATE SET last_value = last_value + 1`)
    .bind(branchId, seqKey);
}

export function idem(db: D1, key: string, branchId: string, userId: string, op: string, ref: string, now: number): Stmt {
  return db
    .prepare(`INSERT INTO idempotency_keys(key, branch_id, user_id, op, result_ref, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(key, branchId, userId, op, ref, now);
}

// Gửi lặp: trả lại kết quả lần trước thay vì báo lỗi.
export async function withIdempotency<T>(db: D1, key: string, run: () => Promise<T>): Promise<T | { replayed: true; resultRef: string }> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof BizError && e.code === 'DUPLICATE_REQUEST') {
      const row = await db.prepare(`SELECT result_ref FROM idempotency_keys WHERE key = ?`).bind(key).first<{ result_ref: string }>();
      if (row) return { replayed: true, resultRef: row.result_ref };
    }
    throw e;
  }
}
