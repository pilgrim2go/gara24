// Dữ liệu chỉ rời API qua các schema này. z.object mặc định BỎ khóa lạ, nên đây là danh sách cho phép:
// dù câu truy vấn lỡ lấy thêm cột giá vốn, view của cố vấn/thợ cũng không trả ra.
import { z } from 'zod';

const vnd = z.number().int();
const ms = z.number().int().nullable();

export const LineView = z.object({
  id: z.string(),
  line_no: z.number().int(),
  line_type: z.enum(['labor', 'part', 'sublet', 'fee']),
  item_id: z.string().nullable(),
  description: z.string(),
  qty_m: z.number().int(),
  unit_price_vnd: vnd,
  gross_vnd: vnd,
  discount_vnd: vnd,
  net_vnd: vnd,
  issued_qty_m: z.number().int(),
  status: z.enum(['active', 'cancelled']),
});

// Lịch sử trạng thái của lệnh (work_order_events): ai, lúc nào, từ đâu sang đâu. Không có tiền, không có giá vốn.
export const WorkOrderEventView = z.object({
  at: z.number().int(),
  kind: z.enum(['status', 'lock', 'unlock', 'reopen']),
  from_value: z.string().nullable(),
  to_value: z.string().nullable(),
  by_id: z.string(),
  by_name: z.string(),
  reason: z.string().nullable(),
});

export const WorkOrderView = z.object({
  id: z.string(),
  order_no: z.string().nullable(),
  status: z.string(),
  payment_status: z.string(),
  vehicle_id: z.string(),
  plate: z.string().nullable(),
  received_at: z.number().int(),
  promised_at: ms,
  labor_gross_vnd: vnd,
  parts_gross_vnd: vnd,
  discount_vnd: vnd,
  grand_total_vnd: vnd,
  paid_vnd: vnd,
  locked_at: ms,
  lock_reason: z.string().nullable(),
  completed_at: ms,
  completed_biz_date: z.string().nullable(),
  version: z.number().int(),
  vehicle: z.object({ make: z.string().nullable(), model: z.string().nullable(), model_year: z.number().int().nullable() }),
  hold: z.object({ id: z.string(), reason: z.string(), started_at: z.number().int(), note: z.string().nullable() }).nullable(),
  lines: z.array(LineView),
  events: z.array(WorkOrderEventView),
});

export const WorkOrderListItem = z.object({
  id: z.string(),
  order_no: z.string().nullable(),
  status: z.string(),
  payment_status: z.string(),
  plate: z.string().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  received_at: z.number().int(),
  promised_at: ms,
  grand_total_vnd: vnd,
  paid_vnd: vnd,
  locked_at: ms,
  version: z.number().int(),
  hold_reason: z.string().nullable(),
  hold_started_at: ms,
});

export const VehicleView = z.object({
  id: z.string(),
  plate: z.string().nullable(),
  vin: z.string().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  model_year: z.number().int().nullable(),
});

// Số lượng tồn ai cũng xem được; giá trị tồn (giá vốn) thì không có ở đây.
export const ItemView = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  item_type: z.string(),
  uom: z.string(),
  default_price_vnd: z.number().int().nullable(),
  on_hand_qty_m: z.number().int(),
});

export const MeView = z.object({
  user_id: z.string(),
  email: z.string(),
  full_name: z.string(),
  branch_id: z.string(),
  branch_name: z.string(),
  roles: z.array(z.string()),
  sees_cost: z.boolean(),
  perms: z.array(z.string()),
});

export const IssueView = z.object({
  move_id: z.string(),
  doc_no: z.string(),
  item_id: z.string(),
  work_order_line_id: z.string().nullable(),
  qty_delta_m: z.number().int(),
  total_cost_vnd: vnd,
  cost_status: z.enum(['final', 'provisional']),
  biz_date: z.string(),
});

// Chỉ cho vai trong COST_ROLES
export const WorkOrderCostView = WorkOrderView.extend({
  cost: z.object({
    parts_cost_vnd: vnd,
    cost_status: z.enum(['final', 'provisional']),
    gross_profit_vnd: vnd,
    margin_bp: z.number().int().nullable(),      // phần vạn trên doanh thu trước VAT
  }),
  stock_moves: z.array(IssueView),
});

export const AuditView = z.object({
  at: z.number().int(),
  actor_id: z.string(),
  actor_name: z.string(),
  action: z.string(),
  reason: z.string().nullable(),
  changes: z.unknown().nullable(),
});

export const DailyStatsView = z.object({
  biz_date: z.string(),
  orders_received: z.number().int(),
  orders_cancelled: z.number().int(),
  orders_completed: z.number().int(),
  collected_vnd: vnd,
  qr_in_vnd: vnd,
  cash_in_vnd: vnd,
  refund_out_vnd: vnd,
  stock_in_value_vnd: vnd,
  stock_out_value_vnd: vnd,
  cogs_completed_vnd: vnd,
  rev_labor_completed_vnd: vnd,
  rev_parts_completed_vnd: vnd,
  discount_completed_vnd: vnd,
  cogs_provisional_vnd: vnd,
});

// Lãi gộp theo tháng, ghi nhận theo ngày hoàn thành lệnh. Chưa trừ lương thợ, gia công ngoài, chi phí vận hành.
export const MonthlyStatsView = z.object({
  month: z.string(),
  orders_completed: z.number().int(),
  rev_labor_completed_vnd: vnd,
  rev_parts_completed_vnd: vnd,
  discount_completed_vnd: vnd,
  net_revenue_vnd: vnd,
  cogs_completed_vnd: vnd,
  cogs_provisional_vnd: vnd,
  gross_profit_vnd: vnd,
  margin_bp: z.number().int().nullable(),
  collected_vnd: vnd,
});

// ---------------------------------------------------------------- đầu vào
const id = z.string().min(8).max(64);
export const CreateWorkOrderIn = z.object({ id: id.optional(), vehicle_id: id });
export const AddLinesIn = z.object({
  expected_version: z.number().int().positive(),
  lines: z.array(z.object({
    id: id.optional(),
    line_type: z.enum(['labor', 'part', 'sublet', 'fee']),
    item_id: id.nullable().optional(),
    description: z.string().min(1).max(500),
    qty_m: z.number().int().positive().max(1_000_000_000),
    unit_price_vnd: z.number().int().nonnegative().max(10_000_000_000),
  }).refine((l) => l.line_type !== 'part' || !!l.item_id, { message: 'dòng phụ tùng cần item_id' })).min(1).max(100),
});
export const TransitionIn = z.object({
  expected_version: z.number().int().positive(),
  to: z.enum(['quoted', 'approved', 'in_progress', 'qc', 'delivered', 'closed']),
});
export const IssueIn = z.object({
  warehouse_id: id,
  lines: z.array(z.object({ line_id: id, item_id: id, qty_m: z.number().int().positive() })).min(1).max(100),
});
export const CancelIn = z.object({
  expected_version: z.number().int().positive(),
  paid_action: z.enum(['refund', 'advance']).nullable(),
  reason_code: z.string().regex(/^[A-Z_]{3,40}$/),
  reason: z.string().min(3).max(500),
});
export const CreateVehicleIn = z.object({
  plate: z.string().trim().min(5).max(20),
  vin: z.string().trim().length(17).optional(),
  make: z.string().trim().max(50).optional(),
  model: z.string().trim().max(50).optional(),
  model_year: z.number().int().min(1950).max(2100).optional(),
});
export const HoldIn = z.object({ reason: z.enum(['parts', 'customer_approval', 'bay', 'other']), note: z.string().max(300).optional() });
export const ReopenIn = z.object({ reason: z.string().min(3).max(500) });
export const BankWebhookIn = z.object({
  txn_id: z.string().min(1).max(100),
  amount_vnd: z.number().int().positive(),
  memo: z.string().max(500),
  txn_at: z.number().int(),
});
