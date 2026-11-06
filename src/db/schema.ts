// Schema giai đoạn 1 (tài liệu "gara24 — Mô hình dữ liệu D1 giai đoạn 1", nhóm A–G).
// Quy ước: tiền INTEGER VND (_vnd), số lượng phần nghìn (_m), thời gian ms UTC (_at), biz_date 'YYYY-MM-DD' giờ VN.
// Trigger và mã guard KHÔNG ở đây: nằm trong migration SQL viết tay (drizzle-kit generate --custom).
import { sqliteTable, text, integer, primaryKey, index, uniqueIndex, check, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const nowMs = sql`(CAST(strftime('%s','now') AS INTEGER) * 1000)`;
const createdAt = () => integer('created_at').notNull().default(nowMs);
const branchRef = () => text('branch_id').notNull().references((): AnySQLiteColumn => branches.id);
const version = () => integer('version').notNull().default(1);
// drizzle chỉ kiểm enum ở TypeScript; CHECK này kiểm ở DB, kể cả khi ghi bằng SQL thô trong batch.
const inList = (name: string, col: AnySQLiteColumn, vals: readonly string[]) =>
  check(name, sql`${col} IN (${sql.raw(vals.map((v) => `'${v}'`).join(', '))})`);

const cancelCols = () => ({
  cancelledAt: integer('cancelled_at'),
  cancelledBy: text('cancelled_by'),
  cancelReasonCode: text('cancel_reason_code'),
  cancelReason: text('cancel_reason'),
});

export const ROLES = ['owner', 'manager', 'advisor', 'technician', 'accountant', 'investor', 'storekeeper', 'cashier'] as const;
export const WO_STATUS = ['received', 'quoted', 'approved', 'in_progress', 'qc', 'delivered', 'closed', 'cancelled'] as const;
export const PAY_STATUS = ['unpaid', 'partial', 'paid', 'on_account'] as const;

// ============================================================ A. Nền tảng, phân quyền, nhật ký
// G1-11, G1-16. Một trong hai bảng gốc không có branch_id.
export const legalEntities = sqliteTable('legal_entities', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  taxCode: text('tax_code'),
  entityType: text('entity_type', { enum: ['company', 'household'] }),      // chưa chốt: NULL
  vatMethod: text('vat_method', { enum: ['deduction', 'direct'] }),
  einvoiceProvider: text('einvoice_provider'),
  einvoiceSeries: text('einvoice_series'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('le_tax_uq').on(t.taxCode).where(sql`tax_code IS NOT NULL`)]);

// G1-16, G1-15
export const branches = sqliteTable('branches', {
  id: text('id').primaryKey(),
  legalEntityId: text('legal_entity_id').notNull().references(() => legalEntities.id),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  address: text('address'),
  tz: text('tz').notNull().default('Asia/Ho_Chi_Minh'),
  openHoursJson: text('open_hours_json'),
  createdAt: createdAt(),
});

// Các điểm chưa chốt: mỗi chính sách một key, đổi bằng dòng mới có ngày hiệu lực.
export const settings = sqliteTable('settings', {
  branchId: branchRef(),
  key: text('key').notNull(),
  valueJson: text('value_json').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  setBy: text('set_by').notNull(),
  reason: text('reason'),
  setAt: integer('set_at').notNull().default(nowMs),
}, (t) => [primaryKey({ columns: [t.branchId, t.key, t.effectiveFrom] })]);

// G1-13
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),            // danh tính từ Cloudflare Access
  phone: text('phone'),
  pinHash: text('pin_hash'),                          // đăng nhập nhanh trên máy dùng chung ở xưởng
  status: text('status', { enum: ['active', 'disabled'] }).notNull().default('active'),
  createdAt: createdAt(),
});

export const userRoles = sqliteTable('user_roles', {
  userId: text('user_id').notNull().references(() => users.id),
  branchId: branchRef(),
  role: text('role', { enum: ROLES }).notNull(),
  grantedBy: text('granted_by').notNull(),
  grantedAt: integer('granted_at').notNull().default(nowMs),
  revokedAt: integer('revoked_at'),
}, (t) => [primaryKey({ columns: [t.userId, t.branchId, t.role] }), inList('ur_role_chk', t.role, ROLES)]);

// G1-01, G1-10: bộ đếm số chứng từ theo chi nhánh và năm
export const sequences = sqliteTable('sequences', {
  branchId: branchRef(),
  seqKey: text('seq_key').notNull(),
  lastValue: integer('last_value').notNull(),
}, (t) => [primaryKey({ columns: [t.branchId, t.seqKey] })]);

export const idempotencyKeys = sqliteTable('idempotency_keys', {
  key: text('key').primaryKey(),
  branchId: branchRef(),
  userId: text('user_id').notNull(),
  op: text('op').notNull(),
  resultRef: text('result_ref').notNull(),
  createdAt: integer('created_at').notNull(),
});

// G1-14, G1-04. Trigger chặn UPDATE/DELETE.
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  at: integer('at').notNull(),
  actorId: text('actor_id').notNull(),
  actorRole: text('actor_role'),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  changesJson: text('changes_json'),
  sensitive: integer('sensitive').notNull().default(0),   // 1 = có giá vốn, lọc theo vai
  reason: text('reason'),
  requestId: text('request_id'),
}, (t) => [
  index('audit_entity_idx').on(t.branchId, t.entity, t.entityId, t.at),
  index('audit_at_idx').on(t.branchId, t.at),
  check('audit_sensitive_bool', sql`${t.sensitive} IN (0, 1)`),
]);

// G1-12
export const accountingPeriods = sqliteTable('accounting_periods', {
  branchId: branchRef(),
  period: text('period').notNull(),
  status: text('status', { enum: ['open', 'closed'] }).notNull(),
  closedAt: integer('closed_at'),
  closedBy: text('closed_by'),
}, (t) => [primaryKey({ columns: [t.branchId, t.period] })]);

export const periodEvents = sqliteTable('period_events', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  period: text('period').notNull(),
  action: text('action', { enum: ['close', 'reopen'] }).notNull(),
  at: integer('at').notNull(),
  by: text('by').notNull(),
  reason: text('reason'),
}, (t) => [index('pe_period_idx').on(t.branchId, t.period)]);

// G1-03, G1-14 và ngưỡng tự duyệt
export const approvalRequests = sqliteTable('approval_requests', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  kind: text('kind', { enum: ['manual_discount', 'reopen_order', 'period_reopen', 'negative_stock'] }).notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  requestedJson: text('requested_json').notNull(),
  thresholdJson: text('threshold_json'),
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'auto'] }).notNull(),
  requestedBy: text('requested_by').notNull(),
  requestedAt: integer('requested_at').notNull(),
  decidedBy: text('decided_by'),
  decidedAt: integer('decided_at'),
  note: text('note'),
}, (t) => [index('ar_status_idx').on(t.branchId, t.status)]);

// Luôn rỗng. Chèn mã lỗi = trigger hủy cả batch (migration 0001_guards).
export const guard = sqliteTable('_guard', { code: text('code').notNull() });

// ============================================================ B. Khách và xe
// G1-08, G1-02
export const parties = sqliteTable('parties', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  code: text('code').notNull().unique(),
  misaCode: text('misa_code'),
  kind: text('kind', { enum: ['person', 'company'] }).notNull(),
  displayName: text('display_name').notNull(),
  taxCode: text('tax_code'),
  isCustomer: integer('is_customer').notNull().default(1),
  isSupplier: integer('is_supplier').notNull().default(0),
  isInsurer: integer('is_insurer').notNull().default(0),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
  createdAt: createdAt(),
}, (t) => [index('parties_tax_idx').on(t.taxCode), index('parties_misa_idx').on(t.misaCode)]);

// Thông tin cá nhân tách riêng để ẩn danh hóa được (G1-02, chừa G4-02)
export const partyContacts = sqliteTable('party_contacts', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  partyId: text('party_id').notNull().references(() => parties.id),
  phoneE164: text('phone_e164'),
  email: text('email'),
  address: text('address'),
  consentMarketing: integer('consent_marketing'),
  anonymizedAt: integer('anonymized_at'),
}, (t) => [index('pc_phone_idx').on(t.phoneE164), index('pc_party_idx').on(t.partyId)]);

// Lịch sử theo VIN, không theo biển số (biển số định danh đi theo chủ).
export const vehicles = sqliteTable('vehicles', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  vin: text('vin'),
  make: text('make'),
  model: text('model'),
  modelYear: integer('model_year'),
  engineCode: text('engine_code'),
  fuel: text('fuel'),
  lastOdometerKm: integer('last_odometer_km'),
  lastOdometerAt: integer('last_odometer_at'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('vehicles_vin_uq').on(t.vin).where(sql`vin IS NOT NULL`)]);

export const vehiclePlates = sqliteTable('vehicle_plates', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  vehicleId: text('vehicle_id').notNull().references(() => vehicles.id),
  plateNorm: text('plate_norm').notNull(),
  plateDisplay: text('plate_display').notNull(),
  validFrom: integer('valid_from').notNull(),
  validTo: integer('valid_to'),
}, (t) => [
  index('vp_plate_idx').on(t.plateNorm),
  uniqueIndex('vp_current_uq').on(t.plateNorm).where(sql`valid_to IS NULL`),
]);

export const vehicleOwnerships = sqliteTable('vehicle_ownerships', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  vehicleId: text('vehicle_id').notNull().references(() => vehicles.id),
  partyId: text('party_id').notNull().references(() => parties.id),
  fromAt: integer('from_at').notNull(),
  toAt: integer('to_at'),
}, (t) => [index('vo_vehicle_idx').on(t.vehicleId, t.toAt), index('vo_party_idx').on(t.partyId)]);

// ============================================================ C. Danh mục và kho
// G1-08
export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  code: text('code').notNull().unique(),
  misaCode: text('misa_code'),
  name: text('name').notNull(),
  itemType: text('item_type', { enum: ['part', 'consumable', 'labor', 'service', 'scrap'] }).notNull(),
  uom: text('uom').notNull(),
  trackStock: integer('track_stock').notNull().default(1),
  allowNegative: integer('allow_negative').notNull().default(0),
  defaultPriceVnd: integer('default_price_vnd'),
  vatRateBp: integer('vat_rate_bp'),
  active: integer('active').notNull().default(1),
  createdAt: createdAt(),
}, (t) => [index('items_misa_idx').on(t.misaCode)]);

export const warehouses = sqliteTable('warehouses', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  code: text('code').notNull(),                       // mã kho MISA
  name: text('name'),
}, (t) => [uniqueIndex('wh_code_uq').on(t.branchId, t.code)]);

// G1-05, G1-09. Có giá vốn: không bao giờ trả cho cố vấn/thợ.
export const stockBalances = sqliteTable('stock_balances', {
  warehouseId: text('warehouse_id').notNull().references(() => warehouses.id),
  itemId: text('item_id').notNull().references(() => items.id),
  branchId: branchRef(),
  onHandQtyM: integer('on_hand_qty_m').notNull().default(0),
  onHandValueVnd: integer('on_hand_value_vnd').notNull().default(0),
  lastUnitCostVnd: integer('last_unit_cost_vnd').notNull().default(0),
  allowNegative: integer('allow_negative').notNull().default(0),
  version: version(),
}, (t) => [
  primaryKey({ columns: [t.warehouseId, t.itemId] }),
  check('stock_not_negative', sql`${t.onHandQtyM} >= 0 OR ${t.allowNegative} = 1`),
]);

// G1-05, G1-10
export const stockDocs = sqliteTable('stock_docs', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  docNo: text('doc_no').notNull(),
  docType: text('doc_type', { enum: ['purchase_receipt', 'order_issue', 'order_return', 'supplier_return', 'adjustment', 'transfer_out', 'transfer_in', 'scrap_sale'] }).notNull(),
  warehouseId: text('warehouse_id').notNull().references(() => warehouses.id),
  workOrderId: text('work_order_id').references((): AnySQLiteColumn => workOrders.id),
  supplierPartyId: text('supplier_party_id').references(() => parties.id),
  supplierInvoiceNo: text('supplier_invoice_no'),
  supplierInvoiceDate: text('supplier_invoice_date'),
  subtotalVnd: integer('subtotal_vnd'),
  vatVnd: integer('vat_vnd'),
  totalVnd: integer('total_vnd'),
  bizDate: text('biz_date').notNull(),
  reversesDocId: text('reverses_doc_id'),
  status: text('status', { enum: ['posted', 'cancelled'] }).notNull(),
  note: text('note'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  uniqueIndex('sd_no_uq').on(t.branchId, t.docNo),
  index('sd_wo_idx').on(t.workOrderId),
  index('sd_date_idx').on(t.branchId, t.bizDate),
  inList('sd_type_chk', t.docType, ['purchase_receipt', 'order_issue', 'order_return', 'supplier_return', 'adjustment', 'transfer_out', 'transfer_in', 'scrap_sale']),
]);

// Sổ kho, chỉ ghi thêm. total_cost_vnd luôn >= 0; chiều theo dấu qty_delta_m.
export const stockMoves = sqliteTable('stock_moves', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  stockDocId: text('stock_doc_id').notNull().references(() => stockDocs.id),
  warehouseId: text('warehouse_id').notNull().references(() => warehouses.id),
  itemId: text('item_id').notNull().references(() => items.id),
  qtyDeltaM: integer('qty_delta_m').notNull(),
  totalCostVnd: integer('total_cost_vnd').notNull(),
  costStatus: text('cost_status', { enum: ['final', 'provisional'] }).notNull(),
  costingMethod: text('costing_method').notNull(),
  workOrderId: text('work_order_id').references((): AnySQLiteColumn => workOrders.id),
  workOrderLineId: text('work_order_line_id').references((): AnySQLiteColumn => workOrderLines.id),
  bizDate: text('biz_date').notNull(),
  reversesMoveId: text('reverses_move_id'),
}, (t) => [
  index('sm_item_date_idx').on(t.branchId, t.itemId, t.bizDate),
  index('sm_wo_idx').on(t.workOrderId),
  index('sm_line_idx').on(t.workOrderLineId),
  index('sm_doc_idx').on(t.stockDocId),
  check('move_qty_nonzero', sql`${t.qtyDeltaM} <> 0`),
  check('move_cost_non_negative', sql`${t.totalCostVnd} >= 0`),
  inList('sm_coststatus_chk', t.costStatus, ['final', 'provisional']),
]);

// G1-09: bình quân cuối kỳ chốt giá ở đây
export const costRuns = sqliteTable('cost_runs', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  period: text('period').notNull(),
  method: text('method', { enum: ['moving_avg', 'period_avg', 'fifo'] }).notNull(),
  status: text('status', { enum: ['running', 'done', 'failed'] }).notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  movesUpdated: integer('moves_updated'),
}, (t) => [uniqueIndex('cr_period_uq').on(t.branchId, t.period, t.method)]);

// Chỉ dùng nếu MISA tính FIFO
export const costLayers = sqliteTable('cost_layers', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  warehouseId: text('warehouse_id').notNull().references(() => warehouses.id),
  itemId: text('item_id').notNull().references(() => items.id),
  receiptMoveId: text('receipt_move_id').notNull().references(() => stockMoves.id),
  qtyRemainingM: integer('qty_remaining_m').notNull(),
  unitCostVnd: integer('unit_cost_vnd').notNull(),
}, (t) => [index('cl_item_idx').on(t.warehouseId, t.itemId, t.receiptMoveId)]);

// ============================================================ D. Lệnh sửa chữa và điều phối
export const bays = sqliteTable('bays', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  active: integer('active').notNull().default(1),
}, (t) => [uniqueIndex('bays_code_uq').on(t.branchId, t.code)]);

// G1-01, G1-03, G1-04, G1-15
export const workOrders = sqliteTable('work_orders', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  orderSeq: integer('order_seq'),
  orderNo: text('order_no'),                          // NULL khi tạo offline, server cấp sau
  vehicleId: text('vehicle_id').notNull().references(() => vehicles.id),
  customerPartyId: text('customer_party_id').references(() => parties.id),
  advisorId: text('advisor_id').references(() => users.id),
  bayId: text('bay_id').references(() => bays.id),
  odometerInKm: integer('odometer_in_km'),
  complaint: text('complaint'),
  status: text('status', { enum: WO_STATUS }).notNull(),
  paymentStatus: text('payment_status', { enum: PAY_STATUS }).notNull().default('unpaid'),
  receivedAt: integer('received_at').notNull(),
  promisedAt: integer('promised_at'),
  completedAt: integer('completed_at'),
  deliveredAt: integer('delivered_at'),
  fullyPaidAt: integer('fully_paid_at'),
  closedAt: integer('closed_at'),
  receivedBizDate: text('received_biz_date').notNull(),
  completedBizDate: text('completed_biz_date'),
  laborGrossVnd: integer('labor_gross_vnd').notNull().default(0),
  partsGrossVnd: integer('parts_gross_vnd').notNull().default(0),
  discountVnd: integer('discount_vnd').notNull().default(0),
  vatVnd: integer('vat_vnd').notNull().default(0),
  grandTotalVnd: integer('grand_total_vnd').notNull().default(0),
  paidVnd: integer('paid_vnd').notNull().default(0),
  lockedAt: integer('locked_at'),
  lockReason: text('lock_reason'),
  lockPolicy: text('lock_policy', { enum: ['invoice_or_paid', 'paid', 'invoice'] }).notNull(),
  policySnapshotJson: text('policy_snapshot_json'),
  reopenCount: integer('reopen_count').notNull().default(0),
  ...cancelCols(),
  createdBy: text('created_by').notNull(),
  version: version(),
}, (t) => [
  uniqueIndex('wo_no_uq').on(t.branchId, t.orderNo),
  index('wo_board_idx').on(t.branchId, t.status, t.promisedAt),
  index('wo_vehicle_idx').on(t.vehicleId, t.receivedAt),
  index('wo_completed_idx').on(t.branchId, t.completedBizDate),
  check('wo_paid_nonneg', sql`${t.paidVnd} >= 0`),
  inList('wo_status_chk', t.status, WO_STATUS),
  inList('wo_paystatus_chk', t.paymentStatus, PAY_STATUS),
  inList('wo_lockpolicy_chk', t.lockPolicy, ['invoice_or_paid', 'paid', 'invoice']),
]);

export const workOrderEvents = sqliteTable('work_order_events', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  workOrderId: text('work_order_id').notNull().references(() => workOrders.id),
  kind: text('kind', { enum: ['status', 'lock', 'unlock', 'reopen'] }).notNull(),
  fromValue: text('from_value'),
  toValue: text('to_value'),
  at: integer('at').notNull(),
  by: text('by').notNull(),
  reason: text('reason'),
}, (t) => [index('woe_order_idx').on(t.workOrderId, t.at), inList('woe_kind_chk', t.kind, ['status', 'lock', 'unlock', 'reopen'])]);

// "Chờ" là khoảng thời gian có lý do, không phải trạng thái lệnh
export const workOrderHolds = sqliteTable('work_order_holds', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  workOrderId: text('work_order_id').notNull().references(() => workOrders.id),
  lineId: text('line_id'),                            // chừa G3-03
  reason: text('reason', { enum: ['parts', 'customer_approval', 'bay', 'other'] }).notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  note: text('note'),
}, (t) => [
  index('woh_order_idx').on(t.workOrderId),
  index('woh_open_idx').on(t.branchId).where(sql`ended_at IS NULL`),
]);

// Không có cột giá vốn.
export const workOrderLines = sqliteTable('work_order_lines', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  workOrderId: text('work_order_id').notNull().references(() => workOrders.id),
  lineNo: integer('line_no').notNull(),
  lineType: text('line_type', { enum: ['labor', 'part', 'sublet', 'fee'] }).notNull(),
  itemId: text('item_id').references(() => items.id),
  description: text('description').notNull(),
  qtyM: integer('qty_m').notNull(),
  unitPriceVnd: integer('unit_price_vnd').notNull(),
  grossVnd: integer('gross_vnd').notNull(),
  discountVnd: integer('discount_vnd').notNull().default(0),
  netVnd: integer('net_vnd').notNull(),
  vatRateBp: integer('vat_rate_bp'),
  vatVnd: integer('vat_vnd').notNull().default(0),
  issuedQtyM: integer('issued_qty_m').notNull().default(0),
  approvalStatus: text('approval_status', { enum: ['approved', 'pending', 'declined'] }).notNull().default('approved'),
  approvedAt: integer('approved_at'),
  source: text('source', { enum: ['quote', 'addon'] }).notNull().default('quote'),
  status: text('status', { enum: ['active', 'cancelled'] }).notNull().default('active'),
  partTier: text('part_tier'),                        // chừa G2-02
  stdHoursM: integer('std_hours_m'),                  // chừa G3-04
  warrantyMonths: integer('warranty_months'),         // chừa G2-07
  warrantyKm: integer('warranty_km'),
  ...cancelCols(),
  version: version(),
}, (t) => [
  index('wol_order_idx').on(t.workOrderId, t.lineNo),
  check('wol_qty_pos', sql`${t.qtyM} > 0`),
  check('wol_price_nonneg', sql`${t.unitPriceVnd} >= 0`),
  check('issued_within_line', sql`${t.issuedQtyM} >= 0 AND ${t.issuedQtyM} <= ${t.qtyM}`),
  inList('wol_type_chk', t.lineType, ['labor', 'part', 'sublet', 'fee']),
  inList('wol_status_chk', t.status, ['active', 'cancelled']),
]);

// Giá vốn lệnh tách khỏi work_orders để truy vấn của cố vấn/thợ không bao giờ chạm tới (G1-13)
export const workOrderCosts = sqliteTable('work_order_costs', {
  workOrderId: text('work_order_id').primaryKey().references(() => workOrders.id),
  branchId: branchRef(),
  partsCostVnd: integer('parts_cost_vnd').notNull().default(0),
  subletCostVnd: integer('sublet_cost_vnd').notNull().default(0),
  costStatus: text('cost_status', { enum: ['final', 'provisional'] }).notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// Chừa G4-06 (bảo hiểm) và G4-07 (khách doanh nghiệp)
export const workOrderPayers = sqliteTable('work_order_payers', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  workOrderId: text('work_order_id').notNull().references(() => workOrders.id),
  partyId: text('party_id').notNull().references(() => parties.id),
  payerRole: text('payer_role', { enum: ['customer', 'insurer', 'fleet'] }).notNull(),
  shareKind: text('share_kind', { enum: ['remainder', 'fixed', 'percent'] }).notNull(),
  shareValue: integer('share_value'),
}, (t) => [index('wop_order_idx').on(t.workOrderId)]);

// G1-06
export const oldParts = sqliteTable('old_parts', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  workOrderLineId: text('work_order_line_id').notNull().references(() => workOrderLines.id),
  qtyM: integer('qty_m').notNull(),
  disposition: text('disposition', { enum: ['return_customer', 'garage_keep', 'scrap_sale', 'hazardous'] }).notNull(),
  decidedBy: text('decided_by').notNull(),
  decidedAt: integer('decided_at').notNull(),
  customerAckAt: integer('customer_ack_at'),
  scrapStockDocId: text('scrap_stock_doc_id').references(() => stockDocs.id),
}, (t) => [index('op_line_idx').on(t.workOrderLineId)]);

// G1-15
export const appointments = sqliteTable('appointments', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  vehicleId: text('vehicle_id').references(() => vehicles.id),
  plateText: text('plate_text'),
  partyId: text('party_id').references(() => parties.id),
  phoneText: text('phone_text'),
  scheduledAt: integer('scheduled_at').notNull(),
  scheduledBizDate: text('scheduled_biz_date').notNull(),
  plannedBayId: text('planned_bay_id').references(() => bays.id),
  jobNote: text('job_note'),
  status: text('status', { enum: ['booked', 'arrived', 'no_show', 'cancelled'] }).notNull(),
  workOrderId: text('work_order_id').references(() => workOrders.id),
}, (t) => [index('appt_date_idx').on(t.branchId, t.scheduledBizDate)]);

// ============================================================ E. Tiền
// G1-11
export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  legalEntityId: text('legal_entity_id').references(() => legalEntities.id),
  workOrderId: text('work_order_id').notNull().references(() => workOrders.id),
  payerPartyId: text('payer_party_id').references(() => parties.id),
  invoiceKind: text('invoice_kind', { enum: ['vat', 'sales'] }),
  status: text('status', { enum: ['draft', 'issuing', 'issued', 'failed', 'replaced', 'adjusted', 'cancelled'] }).notNull(),
  provider: text('provider'),
  templateCode: text('template_code'),
  series: text('series'),
  invoiceNo: text('invoice_no'),
  issuedAt: integer('issued_at'),
  issuedBizDate: text('issued_biz_date'),
  subtotalVnd: integer('subtotal_vnd'),
  vatVnd: integer('vat_vnd'),
  totalVnd: integer('total_vnd'),
  buyerSnapshotJson: text('buyer_snapshot_json'),
  replacesInvoiceId: text('replaces_invoice_id'),
  providerRef: text('provider_ref'),
  lastError: text('last_error'),
}, (t) => [
  index('inv_wo_idx').on(t.workOrderId),
  inList('inv_status_chk', t.status, ['draft', 'issuing', 'issued', 'failed', 'replaced', 'adjusted', 'cancelled']),
  uniqueIndex('inv_no_uq').on(t.provider, t.series, t.invoiceNo).where(sql`invoice_no IS NOT NULL`),
]);

export const invoiceLines = sqliteTable('invoice_lines', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id),
  sourceLineId: text('source_line_id').references(() => workOrderLines.id),
  description: text('description').notNull(),
  uom: text('uom'),
  qtyM: integer('qty_m').notNull(),
  unitPriceVnd: integer('unit_price_vnd').notNull(),
  discountVnd: integer('discount_vnd').notNull().default(0),
  vatCategory: text('vat_category').notNull(),        // '10','8','5','0','KCT'…
  vatRateBp: integer('vat_rate_bp'),
  amountVnd: integer('amount_vnd').notNull(),
  vatVnd: integer('vat_vnd').notNull(),
}, (t) => [index('il_inv_idx').on(t.invoiceId)]);

// G1-07
export const bankTransactions = sqliteTable('bank_transactions', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  provider: text('provider').notNull(),
  providerTxnId: text('provider_txn_id').notNull(),
  accountLast4: text('account_last4'),
  amountVnd: integer('amount_vnd').notNull(),
  memo: text('memo'),
  txnAt: integer('txn_at').notNull(),
  matchStatus: text('match_status', { enum: ['auto', 'manual', 'unmatched', 'ignored'] }).notNull(),
  paymentIntentId: text('payment_intent_id'),
  rawR2Key: text('raw_r2_key'),
}, (t) => [
  uniqueIndex('bt_txn_uq').on(t.provider, t.providerTxnId),
  index('bt_match_idx').on(t.branchId, t.matchStatus),
  inList('bt_match_chk', t.matchStatus, ['auto', 'manual', 'unmatched', 'ignored']),
]);

export const paymentIntents = sqliteTable('payment_intents', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  workOrderId: text('work_order_id').notNull().references(() => workOrders.id),
  amountVnd: integer('amount_vnd').notNull(),
  orderVersion: integer('order_version').notNull(),
  transferRef: text('transfer_ref').notNull().unique(),
  qrPayload: text('qr_payload'),
  expiresAt: integer('expires_at').notNull(),
  status: text('status', { enum: ['pending', 'matched', 'expired', 'void'] }).notNull(),
  bankTxnId: text('bank_txn_id').references(() => bankTransactions.id),
}, (t) => [inList('pi_status_chk', t.status, ['pending', 'matched', 'expired', 'void'])]);

// Ca thu ngân (G1-06). Mỗi người tối đa một ca đang mở trong một chi nhánh. Đếm tiền theo mệnh giá lúc mở và lúc chốt:
// *_denominations_json = {"500000": số tờ, ...}. Lúc chốt: expected = quỹ đầu ca + thu tiền mặt - chi tiền mặt gắn ca,
// variance = counted - expected. Trigger trong migration chặn ghi sai các số này và chặn sửa ca đã chốt.
export const cashSessions = sqliteTable('cash_sessions', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  holderId: text('holder_id').notNull().references(() => users.id),
  openedAt: integer('opened_at').notNull(),
  openingFloatVnd: integer('opening_float_vnd').notNull(),
  closedAt: integer('closed_at'),
  expectedVnd: integer('expected_vnd'),
  countedVnd: integer('counted_vnd'),
  varianceVnd: integer('variance_vnd'),
  denominationsJson: text('denominations_json'),
  closedBy: text('closed_by'),
  status: text('status', { enum: ['open', 'closed'] }).notNull(),
  bizDate: text('biz_date'),                                   // ngày mở ca, giờ VN
  openingDenominationsJson: text('opening_denominations_json'),
  varianceReason: text('variance_reason'),
}, (t) => [
  uniqueIndex('cs_open_uq').on(t.branchId, t.holderId).where(sql`status = 'open'`),
  index('cs_branch_opened_idx').on(t.branchId, t.openedAt),
]);

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  docNo: text('doc_no').notNull(),
  direction: text('direction', { enum: ['in', 'out'] }).notNull(),
  method: text('method', { enum: ['cash', 'qr', 'transfer', 'card'] }).notNull(),
  amountVnd: integer('amount_vnd').notNull(),
  partyId: text('party_id').references(() => parties.id),
  bizDate: text('biz_date').notNull(),
  at: integer('at').notNull(),
  cashSessionId: text('cash_session_id').references(() => cashSessions.id),
  bankTxnId: text('bank_txn_id').references(() => bankTransactions.id),
  expenseCategory: text('expense_category'),          // chi phí vận hành, nếu nguồn là app
  status: text('status', { enum: ['posted', 'cancelled'] }).notNull(),
  reversesPaymentId: text('reverses_payment_id'),
  note: text('note'),
}, (t) => [
  uniqueIndex('pay_no_uq').on(t.branchId, t.docNo),
  index('pay_date_idx').on(t.branchId, t.bizDate),
  index('pay_session_idx').on(t.cashSessionId),
  check('pay_amount_pos', sql`${t.amountVnd} > 0`),
  inList('pay_dir_chk', t.direction, ['in', 'out']),
  inList('pay_method_chk', t.method, ['cash', 'qr', 'transfer', 'card']),
]);

export const paymentAllocations = sqliteTable('payment_allocations', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  paymentId: text('payment_id').notNull().references(() => payments.id),
  target: text('target', { enum: ['work_order', 'advance', 'scrap_sale'] }).notNull(),
  workOrderId: text('work_order_id').references(() => workOrders.id),
  invoiceId: text('invoice_id').references(() => invoices.id),
  amountVnd: integer('amount_vnd').notNull(),
}, (t) => [index('pa_wo_idx').on(t.workOrderId), index('pa_pay_idx').on(t.paymentId), inList('pa_target_chk', t.target, ['work_order', 'advance', 'scrap_sale'])]);

// ============================================================ F. MISA và xuất dữ liệu
export const misaExports = sqliteTable('misa_exports', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  period: text('period').notNull(),
  kind: text('kind', { enum: ['sales_invoice', 'receipt', 'stock_out', 'stock_in', 'correction'] }).notNull(),
  templateVersion: text('template_version').notNull(),
  fileR2Key: text('file_r2_key'),
  rowCount: integer('row_count'),
  sha256: text('sha256'),
  generatedBy: text('generated_by').notNull(),
  generatedAt: integer('generated_at').notNull(),
  status: text('status', { enum: ['generating', 'ready', 'failed'] }).notNull(),
}, (t) => [index('me_period_idx').on(t.branchId, t.period)]);

export const misaExportItems = sqliteTable('misa_export_items', {
  exportId: text('export_id').notNull().references(() => misaExports.id),
  branchId: branchRef(),
  docTable: text('doc_table').notNull(),
  docId: text('doc_id').notNull(),
  docVersion: integer('doc_version').notNull(),
}, (t) => [
  primaryKey({ columns: [t.exportId, t.docTable, t.docId] }),
  uniqueIndex('mei_doc_uq').on(t.docTable, t.docId, t.docVersion),
]);

export const misaAccountRules = sqliteTable('misa_account_rules', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  itemType: text('item_type').notNull(),
  revenueAccount: text('revenue_account'),
  cogsAccount: text('cogs_account'),
  inventoryAccount: text('inventory_account'),
  effectiveFrom: text('effective_from').notNull(),
}, (t) => [index('mar_idx').on(t.branchId, t.itemType, t.effectiveFrom)]);

export const dataExports = sqliteTable('data_exports', {
  id: text('id').primaryKey(),
  branchId: branchRef(),
  kind: text('kind', { enum: ['backup', 'excel_full'] }).notNull(),
  r2Key: text('r2_key').notNull(),
  sha256: text('sha256'),
  at: integer('at').notNull(),
  by: text('by').notNull(),
}, (t) => [index('de_at_idx').on(t.branchId, t.at)]);

// ============================================================ G. Tổng hợp
export const dailyBranchStats = sqliteTable('daily_branch_stats', {
  branchId: branchRef(),
  bizDate: text('biz_date').notNull(),
  ordersReceived: integer('orders_received').notNull().default(0),
  ordersCompleted: integer('orders_completed').notNull().default(0),
  ordersDelivered: integer('orders_delivered').notNull().default(0),
  ordersCancelled: integer('orders_cancelled').notNull().default(0),
  revLaborCompletedVnd: integer('rev_labor_completed_vnd').notNull().default(0),
  revPartsCompletedVnd: integer('rev_parts_completed_vnd').notNull().default(0),
  discountCompletedVnd: integer('discount_completed_vnd').notNull().default(0),
  revInvoicedVnd: integer('rev_invoiced_vnd').notNull().default(0),
  collectedVnd: integer('collected_vnd').notNull().default(0),
  cashInVnd: integer('cash_in_vnd').notNull().default(0),
  qrInVnd: integer('qr_in_vnd').notNull().default(0),
  refundOutVnd: integer('refund_out_vnd').notNull().default(0),
  cogsCompletedVnd: integer('cogs_completed_vnd').notNull().default(0),
  cogsProvisionalVnd: integer('cogs_provisional_vnd').notNull().default(0),
  stockInValueVnd: integer('stock_in_value_vnd').notNull().default(0),
  stockOutValueVnd: integer('stock_out_value_vnd').notNull().default(0),
  opexVnd: integer('opex_vnd').notNull().default(0),
  manualDiscountCount: integer('manual_discount_count').notNull().default(0),
  reopenCount: integer('reopen_count').notNull().default(0),
  priorPeriodAdjustVnd: integer('prior_period_adjust_vnd').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.branchId, t.bizDate] })]);

// Không có cột giá vốn
export const dailyAdvisorStats = sqliteTable('daily_advisor_stats', {
  branchId: branchRef(),
  bizDate: text('biz_date').notNull(),
  advisorId: text('advisor_id').notNull().references(() => users.id),
  ordersCompleted: integer('orders_completed').notNull().default(0),
  revLaborVnd: integer('rev_labor_vnd').notNull().default(0),
  revPartsVnd: integer('rev_parts_vnd').notNull().default(0),
  manualDiscountCount: integer('manual_discount_count').notNull().default(0),
  manualDiscountVnd: integer('manual_discount_vnd').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.branchId, t.bizDate, t.advisorId] })]);

export const dailyBayStats = sqliteTable('daily_bay_stats', {
  branchId: branchRef(),
  bizDate: text('biz_date').notNull(),
  bayId: text('bay_id').notNull().references(() => bays.id),
  occupiedMinutes: integer('occupied_minutes').notNull().default(0),
  ordersCount: integer('orders_count').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.branchId, t.bizDate, t.bayId] })]);

export const periodSnapshots = sqliteTable('period_snapshots', {
  branchId: branchRef(),
  period: text('period').notNull(),
  totalsJson: text('totals_json').notNull(),
  sourceChecksum: text('source_checksum').notNull(),
  createdAt: integer('created_at').notNull(),
  createdBy: text('created_by').notNull(),
}, (t) => [primaryKey({ columns: [t.branchId, t.period] })]);
