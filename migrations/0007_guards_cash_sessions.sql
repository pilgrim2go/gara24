-- Ca thu ngân: mã guard và trigger bất biến. Viết tay, không do drizzle-kit sinh.
-- Thêm mã mới = thêm trigger riêng và tạo lại _guard_unknown với danh sách đầy đủ.
CREATE TRIGGER _guard_no_open_session BEFORE INSERT ON _guard WHEN NEW.code = 'NO_OPEN_SESSION'
BEGIN SELECT RAISE(ABORT, 'GUARD:NO_OPEN_SESSION'); END;
CREATE TRIGGER _guard_session_already_open BEFORE INSERT ON _guard WHEN NEW.code = 'SESSION_ALREADY_OPEN'
BEGIN SELECT RAISE(ABORT, 'GUARD:SESSION_ALREADY_OPEN'); END;
CREATE TRIGGER _guard_session_not_open BEFORE INSERT ON _guard WHEN NEW.code = 'SESSION_NOT_OPEN'
BEGIN SELECT RAISE(ABORT, 'GUARD:SESSION_NOT_OPEN'); END;
CREATE TRIGGER _guard_variance_reason_required BEFORE INSERT ON _guard WHEN NEW.code = 'VARIANCE_REASON_REQUIRED'
BEGIN SELECT RAISE(ABORT, 'GUARD:VARIANCE_REASON_REQUIRED'); END;
--> statement-breakpoint
DROP TRIGGER _guard_unknown;
CREATE TRIGGER _guard_unknown BEFORE INSERT ON _guard WHEN NEW.code NOT IN ('VERSION_CONFLICT','ORDER_NOT_EDITABLE','ISSUE_EXCEEDS_LINE','NO_STOCK_ROW','DUPLICATE_ITEM','EMPTY_LINES','ORDER_NOT_CANCELLABLE','INVOICE_ISSUED','PAID_NEEDS_ACTION','INTENT_STALE','SETTING_MISSING','INVALID_TRANSITION','HOLD_ALREADY_OPEN','NO_OPEN_HOLD','ORDER_NOT_PAYABLE','AMOUNT_EXCEEDS_DUE','ITEM_NOT_STOCKABLE','NO_OPEN_SESSION','SESSION_ALREADY_OPEN','SESSION_NOT_OPEN','VARIANCE_REASON_REQUIRED')
BEGIN SELECT RAISE(ABORT, 'GUARD:UNKNOWN'); END;
--> statement-breakpoint
-- Phiếu gắn ca: chỉ tiền mặt, cùng chi nhánh, ca đang mở.
CREATE TRIGGER pay_session_mismatch BEFORE INSERT ON payments
WHEN NEW.cash_session_id IS NOT NULL AND (NEW.method <> 'cash'
  OR NOT EXISTS (SELECT 1 FROM cash_sessions WHERE id = NEW.cash_session_id AND branch_id = NEW.branch_id))
BEGIN SELECT RAISE(ABORT, 'INV:SESSION_MISMATCH'); END;

CREATE TRIGGER pay_session_closed BEFORE INSERT ON payments
WHEN NEW.cash_session_id IS NOT NULL
 AND (SELECT status FROM cash_sessions WHERE id = NEW.cash_session_id) <> 'open'
BEGIN SELECT RAISE(ABORT, 'INV:SESSION_CLOSED'); END;

-- Số dư ca không âm: không chi quá tiền đang có trong két.
CREATE TRIGGER pay_session_cash_short BEFORE INSERT ON payments
WHEN NEW.cash_session_id IS NOT NULL AND NEW.direction = 'out'
 AND (SELECT s.opening_float_vnd
        + COALESCE((SELECT SUM(CASE p.direction WHEN 'in' THEN p.amount_vnd ELSE -p.amount_vnd END)
                    FROM payments p WHERE p.cash_session_id = s.id AND p.status = 'posted'), 0)
      FROM cash_sessions s WHERE s.id = NEW.cash_session_id) < NEW.amount_vnd
BEGIN SELECT RAISE(ABORT, 'INV:SESSION_CASH_SHORT'); END;

-- Phiếu đã gắn ca không đổi ca, số tiền, chiều, cách thu; ca đã chốt thì không đổi trạng thái phiếu.
CREATE TRIGGER pay_session_locked BEFORE UPDATE ON payments
WHEN NEW.cash_session_id IS NOT OLD.cash_session_id
  OR (OLD.cash_session_id IS NOT NULL AND (NEW.amount_vnd <> OLD.amount_vnd OR NEW.direction <> OLD.direction
      OR NEW.method <> OLD.method OR NEW.branch_id <> OLD.branch_id
      OR (NEW.status <> OLD.status AND (SELECT status FROM cash_sessions WHERE id = OLD.cash_session_id) = 'closed')))
BEGIN SELECT RAISE(ABORT, 'INV:SESSION_LOCKED'); END;

-- Ca: không xóa; ca đã chốt không sửa; thông tin mở ca không đổi.
CREATE TRIGGER cs_no_delete BEFORE DELETE ON cash_sessions BEGIN SELECT RAISE(ABORT, 'INV:NO_DELETE'); END;
CREATE TRIGGER cs_closed_immutable BEFORE UPDATE ON cash_sessions WHEN OLD.status = 'closed'
BEGIN SELECT RAISE(ABORT, 'INV:SESSION_CLOSED'); END;
CREATE TRIGGER cs_open_immutable BEFORE UPDATE ON cash_sessions
WHEN NEW.branch_id <> OLD.branch_id OR NEW.holder_id <> OLD.holder_id OR NEW.opened_at <> OLD.opened_at
  OR NEW.opening_float_vnd <> OLD.opening_float_vnd OR NEW.opening_denominations_json IS NOT OLD.opening_denominations_json
  OR NEW.biz_date IS NOT OLD.biz_date
BEGIN SELECT RAISE(ABORT, 'INV:SESSION_LOCKED'); END;

-- Chốt ca: số dự kiến phải tính lại được từ sổ phiếu, chênh lệch = đếm - dự kiến.
CREATE TRIGGER cs_close_balance BEFORE UPDATE ON cash_sessions
WHEN OLD.status = 'open' AND NEW.status = 'closed' AND (
  NEW.closed_at IS NULL OR NEW.counted_vnd IS NULL OR NEW.expected_vnd IS NULL OR NEW.variance_vnd IS NULL
  OR NEW.expected_vnd <> OLD.opening_float_vnd
      + COALESCE((SELECT SUM(CASE direction WHEN 'in' THEN amount_vnd ELSE -amount_vnd END)
                  FROM payments WHERE cash_session_id = OLD.id AND status = 'posted'), 0)
  OR NEW.variance_vnd <> NEW.counted_vnd - NEW.expected_vnd)
BEGIN SELECT RAISE(ABORT, 'INV:SESSION_BALANCE'); END;
