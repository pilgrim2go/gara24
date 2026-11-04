# Thủ kho

Bạn dùng: **Điều phối** và trang chi tiết lệnh.
Bạn thấy: giá vốn và lãi của lệnh. Bạn không tạo lệnh, không chuyển bước, không thu tiền.

Chưa quen màn hình thì đọc [Làm quen màn hình](../bat-dau.md) trước.

## Tìm lệnh cần xuất

Lệnh xuất được phụ tùng nằm ở các cột **Khách duyệt**, **Đang sửa**, **Kiểm tra**. Mở lệnh, nhìn bảng hạng mục: dòng phụ tùng ghi "Đã xuất 0/2" là còn thiếu 2.

## Xuất phụ tùng

1. Trên trang lệnh, bấm **Xuất phụ tùng**. Nút chỉ hiện khi lệnh đã duyệt, chưa khóa và còn dòng phụ tùng chưa xuất đủ.
2. Cửa sổ liệt kê từng dòng còn thiếu, ô số lượng điền sẵn phần còn lại. Sửa nếu chỉ xuất một phần; để 0 với dòng chưa xuất.
3. Bấm **Xuất kho**. Bảng hạng mục cập nhật "Đã xuất 2/2", khung **Lãi của lệnh** cập nhật giá vốn.

Phần mềm chặn hai trường hợp:

- Xuất quá số lượng ghi trên lệnh: báo "Số lượng xuất vượt số lượng ghi trên lệnh". Cần thêm thì nhờ cố vấn sửa báo giá.
- Kho trên phần mềm không đủ hàng: báo "Kho không đủ hàng để xuất". Kiểm phiếu nhập còn thiếu. Chỉ phụ tùng được quản lý cho phép tồn âm mới xuất được; khi đó lãi của lệnh có nhãn "Tạm tính".

Giá vốn tính tự động theo bình quân của kho. Quy tắc chi tiết: [Xuất phụ tùng cho lệnh](../workflows/xuat-phu-tung.md).

## Chưa có trong bản này

Nhập kho và trả phụ tùng thừa về kho chưa có màn hình; vẫn ghi sổ như hiện tại và báo quản lý.
