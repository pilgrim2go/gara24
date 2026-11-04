# Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Xử lý |
| --- | --- | --- |
| Khách đã chuyển khoản nhưng lệnh chưa ghi nhận | Lệnh đổi tổng tiền sau khi tạo mã QR, hoặc nội dung chuyển khoản thiếu mã `G24…` | Giao dịch nằm ở `bank_transactions` với `match_status = 'unmatched'`; thu ngân ghép tay (màn hình ghép tay chưa có) |
| Lỗi 409 `ORDER_LOCKED` khi sửa lệnh | Lệnh đã thu đủ hoặc đã có hóa đơn | Quản lý mở lại lệnh kèm lý do; lệnh có hóa đơn đã phát hành phải đi luồng điều chỉnh hóa đơn |
| Lỗi 409 `INSUFFICIENT_STOCK` | Tồn kho trên app ít hơn số cần xuất | Kiểm phiếu nhập còn thiếu; chỉ quản lý được mở cho phép tồn âm theo từng phụ tùng |
| Lỗi 409 `PERIOD_CLOSED` | Ghi chứng từ vào tháng đã khóa | Ghi vào kỳ đang mở; mở lại kỳ cần kế toán đồng ý |
| Lỗi 409 `VERSION_CONFLICT` | Người khác vừa sửa cùng lệnh | Tải lại lệnh rồi thao tác lại |
