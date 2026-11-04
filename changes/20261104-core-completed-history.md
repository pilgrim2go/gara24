---
lane: core
docs-impact: user
---

- Lệnh sang `delivered` lần đầu = hoàn thành: ghi `completed_at`, `completed_biz_date` (giờ VN) và cộng doanh thu công/phụ tùng, giảm giá, giá vốn (tách phần tạm tính) vào `daily_branch_stats` theo ngày hoàn thành; migration 0004 bù cho lệnh đã giao trước đó; thêm bất biến đối chiếu. API mới `GET /api/dashboard/monthly?from=YYYY-MM&to=YYYY-MM` (lãi gộp tháng, chỉ vai xem giá vốn); dashboard ngày trả thêm `orders_completed`, `discount_completed_vnd`, `cogs_provisional_vnd`.
- Nhật ký (`/audit`) trả thêm `actor_name`; chi tiết lệnh trả `events` (lịch sử trạng thái, khóa/mở khóa, kèm `by_name`) và `completed_at`. `system` hiện là "Hệ thống".
- Yêu cầu làn web: hiện tên người trong nhật ký, dòng thời gian trạng thái trên chi tiết lệnh, báo cáo lãi gộp tháng. 52 test (thêm 6).
