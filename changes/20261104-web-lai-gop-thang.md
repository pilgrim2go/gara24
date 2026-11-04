---
lane: web
docs-impact: user
---

- Nhật ký lệnh hiện tên người (`actor_name`) thay mã; "Hệ thống" cho thao tác Worker tự ghi.
- Chi tiết lệnh có **Dòng thời gian** từ `events`: đổi trạng thái, khóa (đã thu đủ / có hóa đơn), mở khóa; giờ VN có năm; tên người; lý do nếu có (mã lý do hủy đổi sang chữ). Mọi vai xem lệnh đều thấy (không có tiền). Lệnh đã giao hiện "Hoàn thành (giao xe) lúc …" từ `completed_at`.
- Trang mới **Lãi gộp tháng** (`#/monthly`, `GET /api/dashboard/monthly`): mặc định 6 tháng gần nhất; bảng tháng gồm lệnh hoàn thành, doanh thu thuần, giá vốn, lãi gộp, biên %; dòng "Cả kỳ" tính lại biên từ tổng. Tháng không có số liệu hiện 0 để bảng liền mạch. Tháng có giá vốn tạm tính gắn nhãn "Tạm tính" kèm số tiền tạm tính. Ghi chú cố định: chưa trừ lương thợ, gia công ngoài, chi phí vận hành. Chặn ở client khi sai định dạng, ngược chiều hoặc quá 24 tháng (khớp giới hạn API).
- Menu và route chỉ có khi `/api/me` trả quyền `dashboard.read` (chủ, quản lý, kế toán, nhà đầu tư; đều thuộc vai xem giá vốn).
- Kiểu `DailyStats` thêm `orders_completed`, `discount_completed_vnd`, `cogs_provisional_vnd`; thêm `OrderEvent`, `MonthlyStats`, `completed_at` cho `Order`, `actor_name` cho `AuditEntry`.
- Màn hình hẹp (≤ 640px): ô chọn ngày/tháng ở Báo cáo và Lãi gộp không còn làm trang cuộn ngang.
- Không thêm hay đổi gói npm; `npm audit` (web và gốc): 0 lỗ hổng.
- docs-impact user: hướng dẫn chủ gara / kế toán / nhà đầu tư cần mục "Lãi gộp tháng" và "Dòng thời gian" trên chi tiết lệnh.
