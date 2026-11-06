---
lane: core
docs-impact: user
---

- Ca thu ngân: `POST /api/cash-sessions` (mở ca, đếm theo mệnh giá 100 đ đến 500.000 đ), `POST /api/cash-sessions/:id/close` (chốt ca: dự kiến = quỹ đầu ca + thu - chi tiền mặt gắn ca, tính ở DB; chênh lệch = đếm - dự kiến), `GET /api/cash-sessions` (lọc `status`, `from`, `to`), `GET /api/cash-sessions/:id` (kèm phiếu PT/PC), `GET /api/cash-sessions/current`. Chủ, quản lý, kế toán xem mọi ca; thu ngân chỉ ca của mình (ca khác 404); chủ, quản lý chốt hộ được; kế toán chỉ xem. Quyền mới: `cash.session`, `cash.session.all`, `cash.session.manage`.
- Setting `cash.require_session` (mặc định bật): thu tiền mặt và hoàn tiền khi hủy lệnh đòi ca đang mở (`NO_OPEN_SESSION`); phiếu PT/PC gắn vào ca của người thao tác. `cash.variance_reason_threshold_vnd` (mặc định 0): lệch quá ngưỡng phải có lý do (`VARIANCE_REASON_REQUIRED`). Trigger: không chi quá tiền trong két (`SESSION_CASH_SHORT`), ca đã chốt và phiếu gắn ca không sửa được, chốt ca phải khớp sổ phiếu. Bất biến mới: số dư ca, tiền theo mệnh giá, phiếu gắn ca đúng chi nhánh và thời gian ca.
- Yêu cầu làn web: màn hình mở ca/chốt ca (nhập số tờ từng mệnh giá, hiện chênh lệch, ô lý do), báo "chưa mở ca" khi thu tiền mặt, danh sách ca cho quản lý. Làn user cập nhật thu-ngan.md (mở/chốt ca) và hướng dẫn cho quản lý. Chưa làm: đếm mù (ẩn số dự kiến trước khi chốt), nộp tiền ca về quỹ chính, phiếu chi ngoài lệnh.
