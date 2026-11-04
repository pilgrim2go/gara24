# Lệnh hoàn thành và lãi gộp tháng

Người đọc: chủ gara, quản lý, kế toán, nhà đầu tư. Cố vấn, thợ, thủ kho, thu ngân không xem được báo cáo này.

## Doanh thu tính vào ngày nào

Lệnh **hoàn thành** khi xe được bàn giao cho khách, tức là lần đầu có người bấm **Bàn giao xe** trên lệnh. Doanh thu và giá vốn phụ tùng của lệnh được ghi vào **ngày hoàn thành** đó:

- Không phải ngày nhận xe.
- Không phải ngày khách trả tiền.
- Không phải ngày xuất phụ tùng.

Ngày tính theo giờ Việt Nam: bàn giao lúc 23:30 ngày 30/11 vẫn thuộc ngày 30/11, tháng 11.

Mỗi lệnh chỉ được tính một lần. Bấm **Đóng lệnh** sau khi bàn giao không cộng thêm. Lệnh đã hủy không có doanh thu.

Vì phần mềm lấy đúng lúc bấm nút, hãy bấm **Bàn giao xe** ngay khi giao xe. Giao xe ngày 31/10 mà sáng 01/11 mới bấm thì lệnh rơi vào tháng 11.

### Ví dụ: nhận cuối tháng 10, giao đầu tháng 11

Lệnh RO-2026-0123: tiền công 500.000 đ, phụ tùng 400.000 đ, giảm giá 50.000 đ. Giá vốn phụ tùng 240.000 đ.

| Ngày | Việc | Tính vào đâu |
| --- | --- | --- |
| 28/10 | Nhận xe, tạo lệnh | Báo cáo ngày 28/10: thêm 1 lệnh tiếp nhận. Chưa có doanh thu. |
| 30/10 | Thủ kho xuất phụ tùng | Báo cáo ngày 30/10: giá vốn xuất kho 240.000 đ. Chưa có doanh thu. |
| 02/11 | Bàn giao xe | **Lãi gộp tháng 11**: 1 lệnh hoàn thành, doanh thu thuần 850.000 đ, giá vốn 240.000 đ, lãi gộp 610.000 đ. |
| 05/11 | Khách chuyển khoản 850.000 đ | Báo cáo ngày 05/11: tiền đã thu 850.000 đ. Lãi gộp tháng 11 không đổi. |

Kết quả: lệnh này nằm trong lãi gộp **tháng 11**, không nằm trong tháng 10, dù xe vào xưởng và phụ tùng xuất kho trong tháng 10.

## Đọc báo cáo lãi gộp tháng

Mỗi tháng một dòng, gồm:

| Mục | Nghĩa |
| --- | --- |
| Lệnh hoàn thành | Số xe bàn giao trong tháng |
| Tiền công, Phụ tùng | Tổng tiền công và tiền phụ tùng trên các lệnh đó, trước giảm giá |
| Giảm giá | Tổng giảm giá trên các lệnh đó |
| Doanh thu thuần | Tiền công + phụ tùng − giảm giá |
| Giá vốn | Tổng giá vốn phụ tùng của các lệnh đó |
| Trong đó tạm tính | Phần giá vốn chưa chốt, xem mục dưới |
| Lãi gộp | Doanh thu thuần − giá vốn |
| Biên lãi | Lãi gộp chia doanh thu thuần, tính theo % |
| Tiền đã thu | Tiền thực nhận trong tháng (theo ngày thu), để so với doanh thu |

Với ví dụ trên: doanh thu thuần 850.000 đ, lãi gộp 610.000 đ, biên lãi khoảng 71,8%.

Mỗi lần xem được tối đa 24 tháng.

### Lãi gộp chưa phải lãi thật

**Lãi gộp = doanh thu thuần − giá vốn phụ tùng.** Số này mới trừ tiền mua phụ tùng. Chưa trừ:

- Lương, hoa hồng của thợ và nhân viên.
- Tiền mặt bằng, điện nước, khấu hao máy móc, chi phí khác.
- VAT và các loại thuế.

Vì vậy lãi gộp luôn lớn hơn lãi thật. Dùng nó để so tháng này với tháng trước, hoặc xem biên lãi có tụt không. Lãi thật lấy từ sổ sách bên MISA.

### Vì sao không khớp với báo cáo theo ngày

Hai báo cáo đếm theo hai mốc khác nhau:

- **Tiền đã thu** tính theo ngày khách trả. Khách trả trước, trả sau hay chưa trả đều không làm đổi doanh thu tháng.
- **Giá vốn xuất kho** tính theo ngày thủ kho xuất hàng. Phụ tùng xuất tháng 10 cho xe giao tháng 11 nằm trong giá vốn xuất kho tháng 10, nhưng nằm trong lãi gộp tháng 11.
- Xe còn trong xưởng cuối tháng đã có phụ tùng xuất kho nhưng chưa có doanh thu.

Nên tổng giá vốn xuất kho của tháng thường khác giá vốn trong lãi gộp của tháng đó. Đây không phải lỗi.

## Giá vốn tạm tính

Khi phụ tùng được xuất lúc kho trên phần mềm chưa đủ hàng (thường do phiếu nhập chưa nhập vào), phần mềm chưa biết giá mua thật. Nó tạm lấy **giá nhập gần nhất** của phụ tùng đó để tính. Số đó gọi là **giá vốn tạm tính**.

Trên báo cáo tháng, mục "Trong đó tạm tính" là **toàn bộ giá vốn** của các lệnh có ít nhất một phụ tùng tạm tính, không chỉ phần thiếu hàng. Ví dụ: lệnh dùng 3 can nhớt, kho chỉ có 1 can, giá nhập gần nhất 100.000 đ/can: giá vốn lệnh 300.000 đ và cả 300.000 đ được ghi là tạm tính.

Mục này bằng 0 thì giá vốn của tháng đã chắc chắn. Khác 0 thì lãi gộp tháng đó còn có thể sai.

### Vì sao số có thể đổi

- **Tháng chưa hết.** Mỗi xe bàn giao thêm được cộng vào tháng hiện tại. Số tháng này chỉ đứng yên sau ngày cuối tháng.
- **Giá vốn tạm tính chưa phải giá thật.** Khi nhập bù hàng với giá khác giá nhập gần nhất, giá vốn thật của lệnh khác số đã ghi. Ví dụ nhớt về với giá 110.000 đ/can thì giá vốn thật của lệnh trên là 320.000 đ, lãi gộp giảm 20.000 đ.

Lưu ý bản này: phần mềm **chưa tự chốt lại** giá vốn tạm tính sau khi nhập bù, nên số trên báo cáo vẫn giữ giá tạm. Coi phần tạm tính là số ước lượng. Kế toán kiểm phiếu nhập còn thiếu trước khi chuyển số sang MISA.

Lệnh đã bàn giao xe thì không thêm, sửa hạng mục được nữa, nên doanh thu của lệnh đã hoàn thành không đổi.

## Chưa có trong bản này

Phần mềm đã tính sẵn lãi gộp tháng nhưng mục **Báo cáo** trên màn hình chưa hiện bảng này. Khi màn hình cập nhật, bảng sẽ hiện các mục như trên.
