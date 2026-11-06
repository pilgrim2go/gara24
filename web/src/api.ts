// Gọi API cùng origin. Production: Cloudflare Access gắn danh tính vào request.
// Local: header x-dev-user-email (chỉ có tác dụng khi Worker bật DEV_AUTH=1).
const USER_KEY = 'gara24.devUser';

export const devUser = {
  get: () => localStorage.getItem(USER_KEY),
  set: (email: string) => localStorage.setItem(USER_KEY, email),
  clear: () => localStorage.removeItem(USER_KEY),
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

// idemKey: thao tác ghi tiền/kho truyền khóa cố định để gửi lại không ghi trùng; bỏ trống thì mỗi lần một khóa mới.
async function request<T>(method: string, path: string, body?: unknown, idemKey?: string): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const u = devUser.get();
  if (u) headers['x-dev-user-email'] = u;
  if (method !== 'GET') headers['idempotency-key'] = idemKey ?? crypto.randomUUID();
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, json?.error ?? `http_${res.status}`);
  return json as T;
}
export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown, idemKey?: string) => request<T>('POST', p, b, idemKey),
};
// Không biết máy chủ đã ghi hay chưa: mất mạng, hoặc lỗi 5xx (có thể đã ghi xong rồi mới lỗi khi đọc lại).
// 4xx/409 là bị từ chối hẳn: cả batch không chạy, khóa chưa được lưu.
export const outcomeUnknown = (e: unknown) => !(e instanceof ApiError) || e.status >= 500;

// ---------------------------------------------------------------- kiểu dữ liệu (khớp src/api/views.ts)
export type Me = { user_id: string; email: string; full_name: string; branch_id: string; branch_name: string; roles: string[]; sees_cost: boolean; perms: string[] };
export type Line = { id: string; line_no: number; line_type: 'labor' | 'part' | 'sublet' | 'fee'; item_id: string | null; description: string; qty_m: number; unit_price_vnd: number; gross_vnd: number; discount_vnd: number; net_vnd: number; issued_qty_m: number; status: 'active' | 'cancelled' };
// Lịch sử trạng thái/khóa của lệnh (work_order_events). by_name: tên người, 'Hệ thống' khi Worker tự ghi.
export type OrderEvent = { at: number; kind: 'status' | 'lock' | 'unlock' | 'reopen'; from_value: string | null; to_value: string | null; by_id: string; by_name: string; reason: string | null };
export type Hold = { id: string; reason: string; started_at: number; note: string | null };
export type Order = {
  id: string; order_no: string | null; status: string; payment_status: string; vehicle_id: string; plate: string | null;
  received_at: number; promised_at: number | null; labor_gross_vnd: number; parts_gross_vnd: number; discount_vnd: number; grand_total_vnd: number; paid_vnd: number;
  locked_at: number | null; lock_reason: string | null; completed_at: number | null; completed_biz_date: string | null;
  version: number; vehicle: { make: string | null; model: string | null; model_year: number | null };
  hold: Hold | null; lines: Line[]; events: OrderEvent[];
  cost?: { parts_cost_vnd: number; cost_status: 'final' | 'provisional'; gross_profit_vnd: number; margin_bp: number | null };
  stock_moves?: Array<{ move_id: string; doc_no: string; item_id: string; qty_delta_m: number; total_cost_vnd: number; cost_status: string; biz_date: string }>;
};
export type OrderListItem = { id: string; order_no: string | null; status: string; payment_status: string; plate: string | null; make: string | null; model: string | null; received_at: number; promised_at: number | null; grand_total_vnd: number; paid_vnd: number; locked_at: number | null; version: number; hold_reason: string | null; hold_started_at: number | null };
export type Vehicle = { id: string; plate: string | null; vin: string | null; make: string | null; model: string | null; model_year: number | null };
export type Item = { id: string; code: string; name: string; item_type: string; uom: string; default_price_vnd: number | null; on_hand_qty_m: number };
export type AuditEntry = { at: number; actor_id: string; actor_name: string; action: string; reason: string | null; changes: unknown };
export type DailyStats = {
  biz_date: string; orders_received: number; orders_cancelled: number; orders_completed: number;
  collected_vnd: number; qr_in_vnd: number; cash_in_vnd: number; refund_out_vnd: number; stock_in_value_vnd: number; stock_out_value_vnd: number;
  cogs_completed_vnd: number; rev_labor_completed_vnd: number; rev_parts_completed_vnd: number; discount_completed_vnd: number; cogs_provisional_vnd: number;
};
// Lãi gộp tháng (GET /api/dashboard/monthly), ghi nhận theo ngày hoàn thành lệnh. margin_bp: phần vạn, null khi doanh thu thuần <= 0.
export type MonthlyStats = {
  month: string; orders_completed: number; rev_labor_completed_vnd: number; rev_parts_completed_vnd: number; discount_completed_vnd: number;
  net_revenue_vnd: number; cogs_completed_vnd: number; cogs_provisional_vnd: number; gross_profit_vnd: number; margin_bp: number | null; collected_vnd: number;
};
export type Warehouse = { id: string; code: string; name: string | null };
// Phiếu thu (PaymentView): không có giá vốn
export type Payment = { id: string; doc_no: string; method: 'cash' | 'qr' | 'transfer' | 'card'; amount_vnd: number; biz_date: string; at: number; note: string | null };
// Phiếu nhập kho (StockReceiptView): có giá nhập, chỉ vai có stock.receive nhận được
export type StockReceipt = {
  id: string; doc_no: string; biz_date: string; warehouse_id: string; supplier_invoice_no: string | null; note: string | null;
  total_cost_vnd: number; lines: Array<{ item_id: string; qty_m: number; total_cost_vnd: number }>;
};
export type Intent = { intent_id: string; transfer_ref: string; amount_vnd: number; expires_at: number };

// ---------------------------------------------------------------- từ ngữ hiển thị
export const STATUS_LABEL: Record<string, string> = {
  received: 'Tiếp nhận', quoted: 'Đã báo giá', approved: 'Khách duyệt', in_progress: 'Đang sửa',
  qc: 'Kiểm tra', delivered: 'Đã bàn giao', closed: 'Đã đóng', cancelled: 'Đã hủy',
};
export const PAY_LABEL: Record<string, string> = { unpaid: 'Chưa thu', partial: 'Thu một phần', paid: 'Đã thu đủ', on_account: 'Ghi nợ' };
export const HOLD_LABEL: Record<string, string> = { parts: 'Chờ phụ tùng', customer_approval: 'Chờ khách duyệt', bay: 'Chờ cầu nâng', other: 'Đang chờ' };
export const ROLE_LABEL: Record<string, string> = {
  owner: 'Chủ gara', manager: 'Quản lý', advisor: 'Cố vấn', technician: 'Thợ', accountant: 'Kế toán',
  investor: 'Nhà đầu tư', storekeeper: 'Thủ kho', cashier: 'Thu ngân',
};
// Bước tiếp theo hợp lệ, khớp TRANSITIONS ở src/ops.ts
export const NEXT: Record<string, Array<{ to: string; label: string }>> = {
  received: [{ to: 'quoted', label: 'Đã gửi báo giá' }, { to: 'approved', label: 'Khách duyệt' }],
  quoted: [{ to: 'approved', label: 'Khách duyệt' }],
  approved: [{ to: 'in_progress', label: 'Bắt đầu sửa' }],
  in_progress: [{ to: 'qc', label: 'Xong, chờ kiểm tra' }],
  qc: [{ to: 'delivered', label: 'Bàn giao xe' }, { to: 'in_progress', label: 'Trả lại thợ' }],
  delivered: [{ to: 'closed', label: 'Đóng lệnh' }],
};

const ERRORS: Record<string, string> = {
  ORDER_LOCKED: 'Lệnh đã khóa vì đã thu đủ tiền hoặc đã có hóa đơn. Mở lại lệnh nếu cần sửa.',
  ORDER_NOT_EDITABLE: 'Lệnh ở trạng thái này không cho thao tác đó (đã khóa, đã hủy hoặc chưa duyệt).',
  ORDER_NOT_CANCELLABLE: 'Không hủy được: lệnh đã khóa, đã bàn giao, hoặc vừa có người sửa. Tải lại rồi thử lại.',
  VERSION_CONFLICT: 'Có người vừa sửa lệnh này. Dữ liệu đã được tải lại, hãy thao tác lại.',
  INSUFFICIENT_STOCK: 'Kho không đủ hàng để xuất. Kiểm tra phiếu nhập còn thiếu.',
  ISSUE_EXCEEDS_LINE: 'Số lượng xuất vượt số lượng ghi trên lệnh.',
  PAID_NEEDS_ACTION: 'Lệnh đã thu tiền: chọn hoàn tiền hoặc giữ làm tiền khách trả trước.',
  INVOICE_ISSUED: 'Lệnh đã có hóa đơn điện tử, phải làm hóa đơn điều chỉnh.',
  PERIOD_CLOSED: 'Tháng này đã khóa sổ, không ghi thêm chứng từ được.',
  PLATE_EXISTS: 'Biển số này đã có trong hệ thống.',
  HOLD_ALREADY_OPEN: 'Lệnh đang ở trạng thái chờ rồi.',
  NO_OPEN_HOLD: 'Lệnh không ở trạng thái chờ.',
  INVALID_TRANSITION: 'Không chuyển sang bước đó được từ trạng thái hiện tại.',
  AMOUNT_EXCEEDS_DUE: 'Số thu lớn hơn số còn phải thu. Có thể vừa có khoản thu khác; tải lại lệnh rồi thử lại.',
  ORDER_NOT_PAYABLE: 'Lệnh đã thu đủ hoặc đã hủy, không thu thêm được.',
  ITEM_NOT_STOCKABLE: 'Có mặt hàng không nhập kho được (dịch vụ, ngừng dùng, không quản lý tồn hoặc thuộc chi nhánh khác).',
  DUPLICATE_ITEM: 'Một mặt hàng xuất hiện ở hai dòng. Gộp lại thành một dòng.',
  EMPTY_LINES: 'Phiếu nhập chưa có dòng nào.',
  warehouse_not_found: 'Không tìm thấy kho này trong chi nhánh.',
  idempotency_key_required: 'Thiếu mã chống gửi trùng. Tải lại trang rồi thử lại.',
  forbidden: 'Vai của bạn không được làm việc này.',
  unauthenticated: 'Chưa đăng nhập.',
  unknown_user: 'Tài khoản chưa được cấp quyền trong gara.',
  invalid_input: 'Thông tin nhập chưa hợp lệ, kiểm tra lại các ô.',
  not_found: 'Không tìm thấy, có thể đã bị xóa khỏi danh sách hoặc thuộc chi nhánh khác.',
};
export const errorText = (e: unknown) => (e instanceof ApiError ? ERRORS[e.code] ?? `Lỗi ${e.code}` : 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');

// ---------------------------------------------------------------- định dạng (giờ Việt Nam)
const VN = 'Asia/Ho_Chi_Minh';
export const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
export const qty = (m: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(m / 1000);
const TF = new Intl.DateTimeFormat('en-GB', { timeZone: VN, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false });
export const timeVN = (ms: number) => {
  const p = Object.fromEntries(TF.formatToParts(ms).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}, ${p.day}/${p.month}`;
};
export function since(ms: number, now = Date.now()) {
  const h = Math.floor((now - ms) / 3600_000);
  if (h < 1) return 'dưới 1 giờ';
  if (h < 24) return `${h} giờ`;
  return `${Math.floor(h / 24)} ngày`;
}
// Có cả năm: dùng cho mốc cần đối chiếu lâu dài (hoàn thành, dòng thời gian)
const TFY = new Intl.DateTimeFormat('en-GB', { timeZone: VN, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false });
export const dateTimeVN = (ms: number) => {
  const p = Object.fromEntries(TFY.formatToParts(ms).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}, ${p.day}/${p.month}/${p.year}`;
};
// Biên lãi từ phần vạn: 1234 -> "12,3%"
export const pct = (bp: number | null) => (bp === null ? '—' : `${(bp / 100).toFixed(1).replace('.', ',')}%`);
export const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: VN }).format(Date.now());
