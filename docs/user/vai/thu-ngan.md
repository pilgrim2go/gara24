# Thu ngân

Bạn dùng: **Điều phối** và trang chi tiết lệnh. Thanh mục ở trên ẩn vì bạn chỉ có một mục.
Bạn không thấy: giá vốn, lãi của lệnh, báo cáo, nhật ký.

Chưa quen màn hình thì đọc [Làm quen màn hình](../bat-dau.md) trước.

## Tìm xe cần thu tiền

Xe đã bàn giao mà chưa thu đủ nằm ở cột **Chờ thu tiền**. Ô "Chờ thu tiền" ở đầu bảng cho biết có bao nhiêu xe. Bấm thẻ xe để mở lệnh; khung **Thanh toán** bên phải ghi số **Còn phải thu**.

## Thu tiền bằng mã QR

1. Bấm **Thu tiền QR**. Nút chỉ hiện khi lệnh còn tiền phải thu.
2. Cửa sổ hiện số tiền (bằng phần còn phải thu) và **nội dung chuyển khoản** bắt đầu bằng `G24`, kèm đồng hồ đếm ngược 15 phút.
3. Đưa khách số tài khoản của gara, số tiền và nội dung chuyển khoản. Nhắc khách giữ nguyên nội dung.
4. Để cửa sổ mở. Phần mềm kiểm tra mỗi 3 giây; ngân hàng báo tiền về thì hiện "Đã nhận tiền. Lệnh được cập nhật." Bấm **Xong**.
5. Thu đủ thì lệnh tự khóa, trạng thái thành "Đã thu đủ". Xe đã bàn giao thì rời bảng điều phối; xe chưa bàn giao thì thẻ có vạch xanh lá.

Hết 15 phút mà khách chưa chuyển: đóng cửa sổ, bấm **Thu tiền QR** lại để tạo mã mới.

Bản demo có thêm nút **Giả lập ngân hàng báo tiền về** để thử mà không cần chuyển tiền thật.

## Trường hợp đặc biệt

- Lệnh bị sửa sau khi tạo mã: khoản chuyển khoản không tự ghép vào lệnh. Bản này chưa có màn hình ghép tay; báo quản lý hoặc kế toán.
- Khách chuyển dư: phần dư thành tiền khách trả trước.

Quy tắc chi tiết: [Thu tiền bằng mã QR](../workflows/thu-tien-qr.md).

## Chưa có trong bản này

Ảnh mã VietQR để khách quét chưa hiện; khách nhập tay. Thu tiền mặt chưa có màn hình.
