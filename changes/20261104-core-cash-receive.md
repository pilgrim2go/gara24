---
lane: core
docs-impact: user
---

- Thu tiền mặt theo lệnh: `POST /api/work-orders/:id/payments/cash` (chủ, quản lý, thu ngân). Ra phiếu PT chung dãy với QR, thu đủ thì khóa lệnh, cộng `collected_vnd`/`cash_in_vnd`. Thu quá số còn phải thu bị chặn (`AMOUNT_EXCEEDS_DUE`); mã QR đang chờ bị hủy. Bất biến mới: `cash_in_vnd`/`qr_in_vnd` khớp sổ phiếu thu.
- Nhập kho: `POST /api/stock/receipts` (chủ, quản lý, thủ kho; cố vấn, thợ, thu ngân 403). Chặn mặt hàng dịch vụ hoặc khác chi nhánh (`ITEM_NOT_STOCKABLE`); kho chưa có dòng tồn thì tự tạo. Ghi số hóa đơn nhà cung cấp và ghi chú.
- Yêu cầu làn web: nút "Thu tiền mặt" trên lệnh (quyền `pay.cash`, tính tiền thối ở giao diện) và màn hình nhập kho (quyền `stock.receive`). Sau đó làn user cập nhật thu-ngan.md, thu-kho.md. Chưa làm: ca thu ngân (`cash_sessions`), danh sách phiếu nhập.
