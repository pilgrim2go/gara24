# Kế toán

Bạn dùng: **Điều phối**, **Báo cáo** và trang chi tiết lệnh, chỉ để xem.
Bạn thấy: giá vốn, lãi của lệnh, lãi gộp tháng, lịch sử và nhật ký của lệnh. Bạn không sửa, không thu tiền, không hủy được lệnh.

Chưa quen màn hình thì đọc [Làm quen màn hình](../bat-dau.md) trước.

## Đối chiếu tiền theo ngày

1. Mở mục **Báo cáo**, chọn **Từ** và **Đến**.
2. Đối chiếu cột **Thu QR** với sao kê ngân hàng; cột **Thu tiền mặt** với quỹ tiền mặt; cột **Hoàn tiền** với phiếu chi.
3. Ô **Tiền đã thu** ở trên bằng tổng thu trừ hoàn tiền.

Ngày tính theo giờ Việt Nam: khoản thu lúc 23:30 thuộc ngày hôm đó, không sang ngày sau.

## Đối chiếu kho

Cột **Nhập kho** và **Xuất kho** là giá trị theo giá vốn. Ô **Giá vốn xuất kho** là tổng xuất trong khoảng ngày đã chọn. Lệnh có lãi "Tạm tính" là có phụ tùng xuất khi kho trên phần mềm chưa đủ hàng; kiểm phiếu nhập còn thiếu trước khi chuyển số sang MISA.

## Lãi gộp tháng

- Doanh thu và giá vốn của lệnh ghi vào **ngày giao xe**, theo giờ Việt Nam. Lệnh nhận 28/10, giao 02/11 thuộc tháng 11, dù phụ tùng xuất kho tháng 10 và khách trả tiền ngày nào.
- Vì vậy **doanh thu tháng** khác **tiền đã thu trong tháng**, và **giá vốn trong lãi gộp** khác **giá vốn xuất kho trong tháng**. Khi đối chiếu, chênh lệch giải thích được bằng xe còn trong xưởng cuối tháng, xe đã giao mà chưa thu đủ, và tiền khách trả trước.
- Lãi gộp = doanh thu thuần − giá vốn phụ tùng; chưa trừ lương, chi phí vận hành, VAT. Không dùng số này thay cho kết quả kinh doanh trên MISA.
- Mục **giá vốn tạm tính** khác 0: số đó lấy theo giá nhập gần nhất. Bản này phần mềm chưa tự chốt lại sau khi nhập bù hàng; kiểm phiếu nhập còn thiếu và ghi nhận chênh lệch trước khi chuyển số sang MISA.

Chi tiết: [Lệnh hoàn thành và lãi gộp tháng](../workflows/hoan-thanh-va-lai-gop-thang.md).

## Kiểm một lệnh

Mở lệnh từ **Điều phối** để xem hạng mục, khung **Thanh toán**, khung **Lãi của lệnh** và lịch sử, nhật ký của lệnh (ai bàn giao ngày nào, ai hủy, ai mở lại, lý do gì). Cách đọc: [Xem lịch sử lệnh](../bat-dau.md#xem-lịch-sử-lệnh-ai-làm-gì-lúc-nào).

Lệnh đã bàn giao và thu đủ, đã đóng hoặc đã hủy không còn trên bảng điều phối; bản này chưa có màn hình tra cứu lệnh cũ.

## Chưa có trong bản này

Bảng lãi gộp tháng trong mục **Báo cáo** (phần mềm đã tính, màn hình chưa hiện) và xuất chứng từ sang MISA.
