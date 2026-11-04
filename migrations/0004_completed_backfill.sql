-- Bù ngày hoàn thành cho lệnh đã giao trước bản này (trước đây transition không ghi completed_at).
-- Hoàn thành = lần đầu sang 'delivered', lấy từ work_order_events. biz_date theo giờ Việt Nam (UTC+7).
-- Cộng vào daily_branch_stats TRƯỚC, khi completed_at còn NULL, để không cộng trùng.
INSERT INTO daily_branch_stats(branch_id, biz_date, orders_completed, rev_labor_completed_vnd, rev_parts_completed_vnd,
                               discount_completed_vnd, cogs_completed_vnd, cogs_provisional_vnd)
SELECT w.branch_id, date((e.at / 1000) + 7 * 3600, 'unixepoch'), COUNT(*),
       SUM(w.labor_gross_vnd), SUM(w.parts_gross_vnd), SUM(w.discount_vnd),
       SUM(COALESCE(c.parts_cost_vnd, 0)), SUM(CASE WHEN c.cost_status = 'provisional' THEN c.parts_cost_vnd ELSE 0 END)
FROM work_orders w
JOIN (SELECT work_order_id, MIN(at) AS at FROM work_order_events WHERE kind = 'status' AND to_value = 'delivered' GROUP BY work_order_id) e
  ON e.work_order_id = w.id
LEFT JOIN work_order_costs c ON c.work_order_id = w.id
WHERE w.completed_at IS NULL AND w.status IN ('delivered', 'closed')
GROUP BY w.branch_id, date((e.at / 1000) + 7 * 3600, 'unixepoch')
ON CONFLICT(branch_id, biz_date) DO UPDATE SET
  orders_completed = orders_completed + excluded.orders_completed,
  rev_labor_completed_vnd = rev_labor_completed_vnd + excluded.rev_labor_completed_vnd,
  rev_parts_completed_vnd = rev_parts_completed_vnd + excluded.rev_parts_completed_vnd,
  discount_completed_vnd = discount_completed_vnd + excluded.discount_completed_vnd,
  cogs_completed_vnd = cogs_completed_vnd + excluded.cogs_completed_vnd,
  cogs_provisional_vnd = cogs_provisional_vnd + excluded.cogs_provisional_vnd;
--> statement-breakpoint
UPDATE work_orders AS w SET
  completed_at = e.at,
  completed_biz_date = date((e.at / 1000) + 7 * 3600, 'unixepoch'),
  delivered_at = COALESCE(w.delivered_at, e.at)
FROM (SELECT work_order_id, MIN(at) AS at FROM work_order_events WHERE kind = 'status' AND to_value = 'delivered' GROUP BY work_order_id) e
WHERE e.work_order_id = w.id AND w.completed_at IS NULL AND w.status IN ('delivered', 'closed');
