---
lane: design
docs-impact: none
---

- `spike-results.md`: bảng API thêm `GET /api/dashboard/monthly` (vai, `from`/`to` YYYY-MM, tối đa 24 tháng) và bảng trường mới (`completed_at`, `completed_biz_date`, `events`, `actor_name`, trường dashboard ngày, trường lãi gộp tháng).
- ADR-0001 mới: hoàn thành = lần đầu sang `delivered`, lý do, hệ quả (chạy lại giá vốn phải điều chỉnh `daily_branch_stats`, bất biến báo lệch), 4 khoảng trống: sublet chưa có giá vốn, chưa trừ lương, kỳ khóa chưa chặn thống kê khi giao xe, tên người lấy lúc đọc.
- Yêu cầu làn core (khi làm): guard khóa kỳ khi sang `delivered`; ghi `sublet_cost_vnd`.
