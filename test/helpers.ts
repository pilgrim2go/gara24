import { getPlatformProxy } from 'wrangler';
import assert from 'node:assert/strict';
import { uuidv7, BizError, type D1 } from '../src/lib.ts';
import { seedBranch, seedItem, seedVehicle, createWorkOrder } from '../src/ops.ts';
import { checkInvariants } from '../src/invariants.ts';

let proxy: Awaited<ReturnType<typeof getPlatformProxy>> | undefined;

export async function getDb(): Promise<D1> {
  proxy ??= await getPlatformProxy({ persist: true });
  return (proxy.env as any).DB as D1;
}
export async function closeDb() {
  await proxy?.dispose();
  proxy = undefined;
}

// 10:00 sáng 04/11/2026 giờ VN
export const NOW = Date.UTC(2026, 10, 4, 3, 0, 0);

// Mỗi test một chi nhánh riêng: branch_id có trên mọi bảng nên dữ liệu không lẫn nhau.
export async function newBranch(db: D1, opts: { lockPolicy?: string | null } = {}) {
  const branchId = uuidv7();
  const code = branchId.slice(-8);
  const { warehouseId } = await seedBranch(db, { branchId, code, now: NOW, lockPolicy: opts.lockPolicy });
  const vehicleId = uuidv7();
  await seedVehicle(db, { branchId, vehicleId, plate: `51H-${code}` });
  return { branchId, code, warehouseId, vehicleId, userId: 'u-test' };
}

export async function newItem(db: D1, b: { branchId: string; code: string; warehouseId: string }, name: string, allowNegative = false) {
  const itemId = uuidv7();
  await seedItem(db, { branchId: b.branchId, itemId, code: `${b.code}-${name}`, warehouseId: b.warehouseId, allowNegative });
  return itemId;
}

export async function newOrder(db: D1, b: { branchId: string; vehicleId: string; userId: string }, now = NOW) {
  const woId = uuidv7();
  const r = (await createWorkOrder(db, { key: uuidv7(), branchId: b.branchId, userId: b.userId, woId, vehicleId: b.vehicleId, now })) as { orderNo: string };
  return { woId, orderNo: r.orderNo };
}

export async function version(db: D1, woId: string): Promise<number> {
  return (await db.prepare(`SELECT version FROM work_orders WHERE id = ?`).bind(woId).first<{ version: number }>())!.version;
}

export async function row<T = any>(db: D1, sql: string, ...args: unknown[]): Promise<T> {
  return (await db.prepare(sql).bind(...args).first<T>())!;
}

export async function expectBizError(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof BizError, `không phải BizError: ${e}`);
    assert.equal(e.code, code, `mã lỗi: ${e.code} | ${e.raw}`);
    return true;
  });
}

export async function assertInvariants(db: D1, branchId: string) {
  const v = await checkInvariants(db, branchId);
  assert.deepEqual(v, [], JSON.stringify(v, null, 2));
}
