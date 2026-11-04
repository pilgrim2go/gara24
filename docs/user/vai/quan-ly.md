# Quản lý

Bạn dùng: **Điều phối**, **Lệnh mới**, **Báo cáo** và mọi nút trên trang chi tiết lệnh.
Bạn thấy: giá vốn, lãi của từng lệnh, nhật ký.

Chưa quen màn hình thì đọc [Làm quen màn hình](../bat-dau.md) trước.

## Điều phối đầu ngày và trong ngày

Mở **Điều phối** và nhìn bốn ô số ở đầu trang:

- **Đang chờ** khác 0: mở các thẻ vạch cam, xem lý do chờ và đã chờ bao lâu. Chờ phụ tùng thì hỏi thủ kho; chờ khách duyệt thì nhắc cố vấn gọi khách.
- **Nằm quá 3 ngày** khác 0: xem xe nào bị kẹt, quyết định đẩy hoặc báo khách.
- Thẻ vạch đỏ "Trễ hẹn giao": ưu tiên trước.
- Cột **Kiểm tra** có xe: kiểm tra rồi bấm **Bàn giao xe**, hoặc **Trả lại thợ** nếu chưa đạt.

Bảng tự làm mới mỗi 20 giây, để mở trên màn hình xưởng được.

## Việc giống cố vấn

Bạn làm được mọi việc của cố vấn: tiếp nhận xe, thêm hạng mục, chuyển bước, báo chờ, thu tiền QR. Xem [hướng dẫn cố vấn](co-van.md). Bạn cũng xuất được phụ tùng như [thủ kho](thu-kho.md).

## Hủy lệnh

Chỉ quản lý và chủ gara hủy được. Lệnh không bị xóa, chỉ chuyển sang "Đã hủy".

1. Trên trang lệnh, bấm **Hủy lệnh** (nút chữ đỏ, cuối hàng nút). Nút chỉ hiện khi lệnh chưa khóa và chưa bàn giao.
2. Chọn lý do: Khách không sửa nữa, Tạo nhầm lệnh, Trùng lệnh khác, Lý do khác.
3. Ghi giải thích thêm, ít nhất 3 ký tự. Ô này bắt buộc.
4. Khách đã trả một phần: chọn **Hoàn lại tiền mặt cho khách** hoặc **Giữ làm tiền khách trả trước**.
5. Bấm **Hủy lệnh**. Phụ tùng đã xuất tự nhập lại kho theo giá vốn lúc xuất.

Quy tắc chi tiết: [Hủy lệnh](../workflows/huy-lenh.md).

## Mở lại lệnh đã khóa

Lệnh tự khóa khi thu đủ tiền. Muốn sửa giá hoặc hạng mục:

1. Bấm **Mở lại lệnh**, ghi lý do (ví dụ "nhập sai giá phụ tùng"), ít nhất 3 ký tự.
2. Bấm **Mở lại lệnh**. Lần mở lại được ghi vào nhật ký kèm lý do.

Lệnh đã có hóa đơn điện tử thì không mở lại được, phải làm hóa đơn điều chỉnh. Quy tắc chi tiết: [Mở lại lệnh đã khóa](../workflows/mo-lai-lenh.md).

## Xem lãi của lệnh

Khung **Lãi của lệnh** bên phải trang chi tiết: giá vốn phụ tùng, lãi gộp, biên lãi. Lãi âm hiện màu đỏ. Số này chưa trừ VAT và chi phí vận hành. Cố vấn, thợ, thu ngân không thấy khung này.

## Báo cáo theo ngày

1. Bấm mục **Báo cáo**. Mặc định hiện từ ngày 1 tháng này đến hôm nay.
2. Đổi **Từ** và **Đến** để xem khoảng khác.
3. Bốn ô tổng: **Tiền đã thu** (đã trừ hoàn tiền), **Lệnh tiếp nhận**, **Giá vốn xuất kho**, **Lệnh hủy**.
4. Bảng theo ngày: lệnh nhận, thu QR, thu tiền mặt, hoàn tiền, giá trị nhập kho, giá trị xuất kho.

Lãi theo tháng chưa có trong báo cáo; sẽ có khi phần mềm ghi nhận lệnh hoàn thành vào số tổng hợp.
