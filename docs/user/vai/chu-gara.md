# Chủ gara

Bạn có toàn quyền như [quản lý](quan-ly.md): tiếp nhận xe, báo giá, xuất phụ tùng, thu tiền, hủy và mở lại lệnh, xem báo cáo. Trang này chỉ nêu các việc chủ gara thường làm.

Chưa quen màn hình thì đọc [Làm quen màn hình](../bat-dau.md) trước.

## Nhìn nhanh tình hình xưởng

Mở **Điều phối**, đọc bốn ô số:

- **Xe trong xưởng**: tải hiện tại.
- **Đang chờ** và **Nằm quá 3 ngày**: số xe bị kẹt. Hai ô này cam là có việc cần hỏi quản lý.
- **Chờ thu tiền**: xe đã giao mà chưa thu đủ tiền; nhiều xe ở đây lâu là tiền đang nằm ngoài.

## Kiểm soát tiền và lãi

- Trên từng lệnh: khung **Lãi của lệnh** cho biết lãi gộp và biên lãi. Lãi âm hiện màu đỏ; nhãn "Tạm tính" nghĩa là có phụ tùng xuất khi kho chưa đủ hàng, giá vốn chưa chốt.
- Mục **Báo cáo**: **Tiền đã thu** theo ngày, tách thu QR và tiền mặt; **Giá vốn xuất kho**; số **Lệnh hủy**. Hướng dẫn đọc: [Báo cáo theo ngày](quan-ly.md#báo-cáo-theo-ngày).
- **Lịch sử lệnh** và **Nhật ký** trên từng lệnh: mọi lần chuyển bước, hủy, mở lại, xuất kho đều ghi tên người làm, giờ và lý do. Lệnh hủy hoặc mở lại nhiều lần là dấu hiệu cần hỏi. Cách đọc: [Xem lịch sử lệnh](../bat-dau.md#xem-lịch-sử-lệnh-ai-làm-gì-lúc-nào).

## Doanh thu tính vào tháng nào

Doanh thu và giá vốn của một lệnh ghi vào **ngày giao xe** (lần đầu bấm **Bàn giao xe**), không phải ngày nhận xe, cũng không phải ngày khách trả tiền.

Ví dụ: xe nhận ngày 28/10, giao ngày 02/11, khách chuyển khoản ngày 05/11. Lệnh này tính vào doanh thu và lãi gộp **tháng 11**. Tháng 10 chỉ ghi lệnh tiếp nhận và phụ tùng đã xuất kho; tiền thu ghi vào ngày 05/11.

Hệ quả: xe nằm xưởng qua cuối tháng làm tháng sau tăng doanh thu. Nhắc nhân viên bấm **Bàn giao xe** ngay lúc giao, không để hôm sau.

Chi tiết và ví dụ có số: [Lệnh hoàn thành và lãi gộp tháng](../workflows/hoan-thanh-va-lai-gop-thang.md).

## Đọc lãi gộp tháng

- **Lãi gộp = doanh thu thuần − giá vốn phụ tùng.** Doanh thu thuần là tiền công cộng phụ tùng trừ giảm giá.
- Đây chưa phải lãi thật: chưa trừ lương, hoa hồng, mặt bằng, điện nước, VAT và chi phí khác. Dùng để so các tháng với nhau và theo dõi biên lãi.
- Mục **giá vốn tạm tính** khác 0: có phụ tùng xuất lúc kho trên phần mềm chưa đủ hàng, giá vốn đang lấy theo giá nhập gần nhất. Lãi gộp tháng đó còn có thể sai khi hàng nhập bù với giá khác.
- Số của tháng hiện tại còn tăng tới hết tháng, mỗi xe giao thêm cộng vào.

Bản này phần mềm đã tính lãi gộp tháng nhưng mục **Báo cáo** chưa hiện bảng; sẽ hiện khi màn hình cập nhật.

## Việc chỉ chủ gara và quản lý làm

- Hủy lệnh: xem [Hủy lệnh](quan-ly.md#hủy-lệnh).
- Mở lại lệnh đã khóa: xem [Mở lại lệnh đã khóa](quan-ly.md#mở-lại-lệnh-đã-khóa).

## Cấp quyền cho nhân viên

Bản này chưa có màn hình thêm người hoặc đổi vai. Gửi danh sách người và vai cho người giữ hệ thống. Quyền của từng vai: [Vai và quyền](../roles.md).
