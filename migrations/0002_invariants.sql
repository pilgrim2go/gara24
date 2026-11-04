-- Trigger bất biến nghiệp vụ: không phụ thuộc API viết đúng.

-- G1-03: không thêm/sửa dòng của lệnh đã khóa
CREATE TRIGGER wol_locked_ins BEFORE INSERT ON work_order_lines
WHEN (SELECT locked_at FROM work_orders WHERE id = NEW.work_order_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'INV:ORDER_LOCKED'); END;

CREATE TRIGGER wol_locked_upd BEFORE UPDATE ON work_order_lines
WHEN (SELECT locked_at FROM work_orders WHERE id = NEW.work_order_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'INV:ORDER_LOCKED'); END;

-- G1-03, G1-05: không xuất/nhập kho gắn vào lệnh đã khóa
CREATE TRIGGER sm_locked_ins BEFORE INSERT ON stock_moves
WHEN NEW.work_order_id IS NOT NULL
 AND (SELECT locked_at FROM work_orders WHERE id = NEW.work_order_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'INV:ORDER_LOCKED'); END;

-- G1-03: tiền trên lệnh đã khóa không đổi được, kể cả trong câu mở khóa
CREATE TRIGGER wo_locked_money BEFORE UPDATE ON work_orders
WHEN OLD.locked_at IS NOT NULL AND (
  NEW.grand_total_vnd <> OLD.grand_total_vnd OR NEW.discount_vnd <> OLD.discount_vnd OR
  NEW.labor_gross_vnd <> OLD.labor_gross_vnd OR NEW.parts_gross_vnd <> OLD.parts_gross_vnd OR
  NEW.vehicle_id <> OLD.vehicle_id)
BEGIN SELECT RAISE(ABORT, 'INV:ORDER_LOCKED'); END;

-- G1-12: không ghi chứng từ vào kỳ đã khóa
CREATE TRIGGER sm_period_closed BEFORE INSERT ON stock_moves
WHEN EXISTS (SELECT 1 FROM accounting_periods
  WHERE branch_id = NEW.branch_id AND period = substr(NEW.biz_date, 1, 7) AND status = 'closed')
BEGIN SELECT RAISE(ABORT, 'INV:PERIOD_CLOSED'); END;

CREATE TRIGGER pay_period_closed BEFORE INSERT ON payments
WHEN EXISTS (SELECT 1 FROM accounting_periods
  WHERE branch_id = NEW.branch_id AND period = substr(NEW.biz_date, 1, 7) AND status = 'closed')
BEGIN SELECT RAISE(ABORT, 'INV:PERIOD_CLOSED'); END;

-- G1-14: sổ chỉ ghi thêm
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'INV:APPEND_ONLY'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'INV:APPEND_ONLY'); END;
CREATE TRIGGER woe_no_update BEFORE UPDATE ON work_order_events BEGIN SELECT RAISE(ABORT, 'INV:APPEND_ONLY'); END;
CREATE TRIGGER woe_no_delete BEFORE DELETE ON work_order_events BEGIN SELECT RAISE(ABORT, 'INV:APPEND_ONLY'); END;
CREATE TRIGGER pa_no_update BEFORE UPDATE ON payment_allocations BEGIN SELECT RAISE(ABORT, 'INV:APPEND_ONLY'); END;
CREATE TRIGGER pa_no_delete BEFORE DELETE ON payment_allocations BEGIN SELECT RAISE(ABORT, 'INV:APPEND_ONLY'); END;

-- stock_moves: chỉ được sửa giá vốn khi đang tạm tính
CREATE TRIGGER sm_no_delete BEFORE DELETE ON stock_moves BEGIN SELECT RAISE(ABORT, 'INV:APPEND_ONLY'); END;
CREATE TRIGGER sm_update_guard BEFORE UPDATE ON stock_moves
WHEN OLD.cost_status = 'final'
  OR NEW.qty_delta_m <> OLD.qty_delta_m OR NEW.item_id <> OLD.item_id
  OR NEW.warehouse_id <> OLD.warehouse_id OR NEW.biz_date <> OLD.biz_date
BEGIN SELECT RAISE(ABORT, 'INV:APPEND_ONLY'); END;

-- G1-04: không xóa chứng từ nghiệp vụ, chỉ hủy
CREATE TRIGGER wo_no_delete BEFORE DELETE ON work_orders BEGIN SELECT RAISE(ABORT, 'INV:NO_DELETE'); END;
CREATE TRIGGER wol_no_delete BEFORE DELETE ON work_order_lines BEGIN SELECT RAISE(ABORT, 'INV:NO_DELETE'); END;
CREATE TRIGGER sd_no_delete BEFORE DELETE ON stock_docs BEGIN SELECT RAISE(ABORT, 'INV:NO_DELETE'); END;
CREATE TRIGGER pay_no_delete BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT, 'INV:NO_DELETE'); END;
CREATE TRIGGER inv_no_delete BEFORE DELETE ON invoices BEGIN SELECT RAISE(ABORT, 'INV:NO_DELETE'); END;

-- G1-16: chứng từ không đổi chi nhánh được. API kiểm quyền theo branch_id nên cột này phải bất biến.
CREATE TRIGGER wo_branch_immutable BEFORE UPDATE OF branch_id ON work_orders
WHEN NEW.branch_id <> OLD.branch_id BEGIN SELECT RAISE(ABORT, 'INV:BRANCH_IMMUTABLE'); END;
CREATE TRIGGER wol_branch_immutable BEFORE UPDATE OF branch_id, work_order_id ON work_order_lines
WHEN NEW.branch_id <> OLD.branch_id OR NEW.work_order_id <> OLD.work_order_id BEGIN SELECT RAISE(ABORT, 'INV:BRANCH_IMMUTABLE'); END;
