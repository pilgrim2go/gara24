// Bộ kiểm bất biến: số dư phải tính lại được từ sổ gốc. Chạy sau mỗi test và trong job đêm.
import type { D1 } from './lib.ts';

const CHECKS: Array<{ name: string; sql: string }> = [
  {
    name: 'stock_balances = SUM(stock_moves)',
    sql: `SELECT b.warehouse_id, b.item_id, b.on_hand_qty_m, b.on_hand_value_vnd, COALESCE(m.q, 0) AS q, COALESCE(m.v, 0) AS v
          FROM stock_balances b
          LEFT JOIN (SELECT warehouse_id, item_id, SUM(qty_delta_m) q, SUM(total_cost_vnd * CASE WHEN qty_delta_m > 0 THEN 1 ELSE -1 END) v
                     FROM stock_moves WHERE branch_id = ?1 GROUP BY warehouse_id, item_id) m
            ON m.warehouse_id = b.warehouse_id AND m.item_id = b.item_id
          WHERE b.branch_id = ?1 AND (b.on_hand_qty_m <> COALESCE(m.q, 0) OR b.on_hand_value_vnd <> COALESCE(m.v, 0))`,
  },
  {
    name: 'work_order_lines.issued_qty_m = xuất ròng theo dòng',
    sql: `SELECT l.id, l.issued_qty_m, -COALESCE(SUM(m.qty_delta_m), 0) AS net
          FROM work_order_lines l LEFT JOIN stock_moves m ON m.work_order_line_id = l.id
          WHERE l.branch_id = ?1 GROUP BY l.id HAVING l.issued_qty_m <> -COALESCE(SUM(m.qty_delta_m), 0)`,
  },
  {
    name: 'work_orders.paid_vnd = SUM(payment_allocations)',
    sql: `SELECT w.id, w.paid_vnd, COALESCE(SUM(a.amount_vnd), 0) AS alloc
          FROM work_orders w LEFT JOIN payment_allocations a ON a.work_order_id = w.id AND a.target = 'work_order'
          WHERE w.branch_id = ?1 GROUP BY w.id HAVING w.paid_vnd <> COALESCE(SUM(a.amount_vnd), 0)`,
  },
  {
    name: 'work_orders.grand_total_vnd = SUM(net dòng còn hiệu lực)',
    sql: `SELECT w.id, w.grand_total_vnd, COALESCE(SUM(l.net_vnd), 0) AS lines
          FROM work_orders w LEFT JOIN work_order_lines l ON l.work_order_id = w.id AND l.status = 'active'
          WHERE w.branch_id = ?1 GROUP BY w.id HAVING w.grand_total_vnd <> COALESCE(SUM(l.net_vnd), 0)`,
  },
  {
    name: 'work_order_costs.parts_cost_vnd = giá vốn xuất ròng',
    sql: `SELECT c.work_order_id, c.parts_cost_vnd, COALESCE(SUM(m.total_cost_vnd * CASE WHEN m.qty_delta_m < 0 THEN 1 ELSE -1 END), 0) AS cost
          FROM work_order_costs c LEFT JOIN stock_moves m ON m.work_order_id = c.work_order_id
          WHERE c.branch_id = ?1 GROUP BY c.work_order_id
          HAVING c.parts_cost_vnd <> COALESCE(SUM(m.total_cost_vnd * CASE WHEN m.qty_delta_m < 0 THEN 1 ELSE -1 END), 0)`,
  },
  {
    name: 'payment_status khớp số tiền',
    sql: `SELECT id, payment_status, paid_vnd, grand_total_vnd FROM work_orders WHERE branch_id = ?1 AND status <> 'cancelled' AND NOT (
            (payment_status = 'unpaid' AND paid_vnd = 0) OR
            (payment_status = 'partial' AND paid_vnd > 0 AND paid_vnd < grand_total_vnd) OR
            (payment_status = 'paid' AND paid_vnd >= grand_total_vnd AND paid_vnd > 0) OR
            payment_status = 'on_account')`,
  },
  {
    name: 'daily_branch_stats tiền thu = SUM(payments)',
    sql: `SELECT s.biz_date, s.collected_vnd, s.refund_out_vnd,
                 COALESCE((SELECT SUM(amount_vnd) FROM payments p WHERE p.branch_id = ?1 AND p.biz_date = s.biz_date AND direction = 'in'), 0) AS pin,
                 COALESCE((SELECT SUM(amount_vnd) FROM payments p WHERE p.branch_id = ?1 AND p.biz_date = s.biz_date AND direction = 'out'), 0) AS pout
          FROM daily_branch_stats s WHERE s.branch_id = ?1
            AND (s.collected_vnd <> pin OR s.refund_out_vnd <> pout)`,
  },
];

export async function checkInvariants(db: D1, branchId: string) {
  const violations: Array<{ check: string; rows: unknown[] }> = [];
  for (const c of CHECKS) {
    const { results } = await db.prepare(c.sql).bind(branchId).all();
    if (results.length) violations.push({ check: c.name, rows: results });
  }
  return violations;
}
