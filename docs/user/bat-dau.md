# Làm quen màn hình

Trang này dùng chung cho mọi vai. Hướng dẫn riêng từng vai: xem [danh sách vai](README.md#hướng-dẫn-theo-vai).

## Mở phần mềm

- Bản chạy thật: mở địa chỉ gara cấp, đăng nhập bằng email công việc. Tài khoản phải được quản lý cấp quyền trước, nếu không sẽ thấy "Tài khoản chưa được cấp quyền trong gara".
- Bản demo: màn hình đầu tiên là danh sách người trong xưởng (ví dụ "Lan (cố vấn dịch vụ)", "Tuấn (thợ)"). Bấm một người để xem phần mềm đúng như người đó thấy. Danh sách trống thì bấm **Nạp dữ liệu mẫu**: phần mềm tạo 9 người, 6 xe và 8 loại phụ tùng có sẵn trong kho.
- Muốn thử vai khác (chỉ bản demo): bấm **Đổi người** ở góc trên bên phải.

## Thanh trên cùng

- Bên trái: chữ **Gara24** và tên chi nhánh. Bấm vào để về bảng điều phối.
- Giữa: các mục **Điều phối**, **Lệnh mới**, **Báo cáo**. Mỗi vai chỉ thấy mục mình dùng được; vai chỉ có một mục thì thanh này ẩn đi.
- Bên phải: tên và vai của người đang dùng.
- Trên điện thoại, các mục chuyển xuống đáy màn hình cho dễ bấm bằng ngón cái.

## Bảng điều phối

Đây là màn hình mở ra đầu tiên. Bảng tự làm mới mỗi 20 giây, không cần tải lại trang.

Bốn ô số ở đầu trang:

| Ô | Nghĩa |
| --- | --- |
| Xe trong xưởng | Số lệnh chưa bàn giao xe |
| Đang chờ | Số lệnh đang báo chờ (chờ phụ tùng, chờ khách duyệt, chờ cầu nâng) |
| Nằm quá 3 ngày | Xe đã vào xưởng hơn 3 ngày mà chưa bàn giao |
| Chờ thu tiền | Xe đã bàn giao mà chưa thu đủ tiền |

Ô "Đang chờ" và "Nằm quá 3 ngày" đổi màu cam khi khác 0.

Năm cột theo tiến độ: **Tiếp nhận** (gồm cả lệnh đã gửi báo giá), **Khách duyệt**, **Đang sửa**, **Kiểm tra**, **Chờ thu tiền**. Trên điện thoại, vuốt ngang để xem từng cột.

Mỗi thẻ xe ghi biển số, số lệnh, hãng và dòng xe, thời gian đã nằm xưởng và tổng tiền khách trả. Vạch màu bên trái thẻ:

| Màu | Nghĩa |
| --- | --- |
| Cam | Đang chờ (có ghi lý do và đã chờ bao lâu) hoặc nằm xưởng quá 3 ngày |
| Đỏ | Quá giờ hẹn giao, kèm dòng "Trễ hẹn giao" |
| Xanh lá | Lệnh đã thu đủ tiền (và tự khóa) trước khi bàn giao xe |

Lệnh rời bảng khi đã bàn giao và thu đủ tiền, khi đã đóng, hoặc khi đã hủy.

Bấm vào thẻ để mở chi tiết lệnh.

## Trang chi tiết lệnh

Từ trên xuống:

1. Biển số, số lệnh (dạng `RO-2026-0001`), dòng xe, giờ vào xưởng. Góc phải là trạng thái thu tiền ("Chưa thu", "Thu một phần", "Đã thu đủ") và nhãn "Đã khóa" nếu có.
2. Thanh tiến độ 6 bước: Tiếp nhận, Đã báo giá, Khách duyệt, Đang sửa, Kiểm tra, Đã bàn giao. Bước hiện tại được tô đậm.
3. Dải cam khi lệnh đang chờ: lý do, từ lúc nào, đã chờ bao lâu. Thời gian chờ không tính vào hiệu suất của thợ.
4. Hàng nút thao tác. Mỗi vai chỉ thấy nút mình được bấm; nút chỉ hiện khi lệnh ở đúng bước.
5. Bảng **Hạng mục**: từng dòng tiền công hoặc phụ tùng, số lượng, đơn giá, thành tiền. Dòng phụ tùng ghi thêm "Đã xuất 1/2" (đã xuất bao nhiêu trên số báo giá). Trên điện thoại, cột đơn giá được ẩn cho gọn.
6. **Lịch sử lệnh** và **Nhật ký**: ai làm gì, lúc nào, lý do. Xem [Xem lịch sử lệnh](#xem-lịch-sử-lệnh-ai-làm-gì-lúc-nào).
7. Khung **Thanh toán**: tiền công, phụ tùng, giảm giá, khách trả, đã thu, còn phải thu.
8. Khung **Lãi của lệnh** (chỉ vai được xem giá vốn): giá vốn phụ tùng, lãi gộp, biên lãi. Nhãn "Tạm tính" nghĩa là có phụ tùng xuất lúc kho trên phần mềm chưa đủ hàng (tồn âm); giá vốn chỉ chính xác sau khi nhập bù hàng.

Bấm **Về bảng điều phối** ở góc trên để quay lại.

## Xem lịch sử lệnh: ai làm gì, lúc nào

Mỗi lệnh giữ lại hai loại ghi chép. Không ai xóa hay sửa được hai loại này.

**Lịch sử trạng thái**: mọi vai đều xem được. Mỗi dòng ghi giờ, việc và tên người làm:

- Mỗi lần chuyển bước, ví dụ "Đang sửa → Kiểm tra, Tuấn, 14:05 02/11".
- Lần đầu chuyển sang "Đã bàn giao": đây là lúc lệnh **hoàn thành**, quyết định doanh thu tính vào tháng nào. Xem [Lệnh hoàn thành và lãi gộp tháng](workflows/hoan-thanh-va-lai-gop-thang.md).
- Lệnh tự khóa khi thu đủ tiền: người làm ghi là "Hệ thống", vì phần mềm tự khóa khi ngân hàng báo tiền về.
- Mở lại lệnh, hủy lệnh: kèm lý do người làm đã ghi.

**Nhật ký**: chi tiết hơn, gồm cả tạo lệnh, thêm hạng mục, báo chờ, hết chờ, xuất phụ tùng. Mỗi dòng ghi họ tên người làm. Chủ gara, quản lý, kế toán, nhà đầu tư, cố vấn và thợ xem được; cố vấn và thợ không thấy các dòng có giá vốn. Thủ kho và thu ngân chỉ xem lịch sử trạng thái.

Dùng hai phần này khi cần trả lời: xe nằm ở bước nào bao lâu, ai bàn giao, ai mở lại lệnh, vì sao hủy.

Lưu ý bản này: lịch sử trạng thái chưa hiện trên trang chi tiết lệnh, và nhật ký trên màn hình có thể vẫn ghi mã người dùng (ví dụ `covan`) thay cho họ tên. Phần mềm đã lưu đủ thông tin; màn hình sẽ hiện khi cập nhật.

## Khi phần mềm báo lỗi

| Thông báo | Làm gì |
| --- | --- |
| Có người vừa sửa lệnh này | Phần mềm đã tải lại lệnh. Xem lại rồi bấm lại. |
| Lệnh đã khóa vì đã thu đủ tiền hoặc đã có hóa đơn | Nhờ quản lý mở lại lệnh nếu thật sự cần sửa. |
| Vai của bạn không được làm việc này | Nhờ người có quyền làm, xem [Vai và quyền](roles.md). |
| Kho không đủ hàng để xuất | Báo thủ kho kiểm phiếu nhập còn thiếu. |
| Không kết nối được máy chủ | Kiểm tra mạng (Wi-Fi hoặc 4G) rồi bấm lại. |

## Chưa có trong bản này

- Ảnh mã VietQR: hiện chỉ hiện số tiền và nội dung chuyển khoản, khách nhập tay vào ứng dụng ngân hàng.
- Ghi thu tiền mặt, nhập kho, trả lại kho, đặt giờ hẹn giao: chưa có màn hình.
- Báo cáo lãi gộp theo tháng và dòng lịch sử trạng thái trên trang lệnh: phần mềm đã tính và lưu, màn hình chưa hiện.
- Tra cứu lệnh đã rời bảng điều phối (đã thu đủ và bàn giao, đã đóng, đã hủy): chưa có màn hình, nên chưa mở lại được những lệnh này để đóng hay sửa.
- Dùng khi mất mạng.
