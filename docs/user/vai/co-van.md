# Cố vấn dịch vụ

Bạn dùng: **Điều phối**, **Lệnh mới** (tiếp nhận xe), trang chi tiết lệnh, cửa sổ thu tiền QR.
Bạn không thấy: giá vốn, lãi của lệnh, báo cáo.

Chưa quen màn hình thì đọc [Làm quen màn hình](../bat-dau.md) trước.

## Tiếp nhận xe

1. Bấm **Tiếp nhận xe** trên bảng điều phối (hoặc mục **Lệnh mới**).
2. Gõ biển số vào ô **Biển số xe**, ví dụ `51H-123.45`. Gõ từ 2 ký tự trở lên là phần mềm bắt đầu tìm; không cần gõ dấu gạch hay dấu chấm.
3. Xe đã có: bấm vào dòng xe, phần mềm tạo lệnh mới và mở luôn trang chi tiết.
4. Xe chưa có (gõ đủ 5 ký tự mà không thấy): bấm **Thêm xe mới**, điền hãng, dòng xe, năm nếu biết, rồi bấm **Thêm xe và tạo lệnh**.

Số lệnh tự cấp dạng `RO-2026-0001`, tăng dần theo năm. Quy tắc chi tiết: [Tiếp nhận xe và báo giá](../workflows/tiep-nhan-va-bao-gia.md).

## Báo giá: thêm hạng mục

1. Trên trang lệnh, bấm **Thêm hạng mục**.
2. Chọn **Tiền công**: gõ việc làm (ví dụ "Công thay má phanh trước"), số lượng, đơn giá.
3. Hoặc chọn **Phụ tùng**: gõ tên hoặc mã để tìm, bấm chọn đúng phụ tùng. Mỗi dòng ghi số tồn kho hiện có. Đơn giá tự điền theo giá bán của gara, sửa được.
4. Bấm **Thêm vào lệnh**. Mỗi lần thêm một dòng.

Báo giá nhiều hơn số tồn kho thì phần mềm nhắc bằng dòng cam, vẫn cho lưu. Hãy báo thủ kho đặt hàng.

## Chuyển bước

Hàng nút trên trang lệnh đổi theo bước hiện tại:

| Lệnh đang ở | Nút | Khi nào bấm |
| --- | --- | --- |
| Tiếp nhận | **Đã gửi báo giá** | Đã gửi báo giá, khách chưa trả lời |
| Tiếp nhận, Đã báo giá | **Khách duyệt** | Khách đồng ý sửa. Từ đây thủ kho mới xuất được phụ tùng. |
| Khách duyệt | **Bắt đầu sửa** | Thợ nhận xe (thợ cũng tự bấm được) |
| Đang sửa | **Xong, chờ kiểm tra** | Thợ báo xong |
| Kiểm tra | **Bàn giao xe** hoặc **Trả lại thợ** | Kiểm tra đạt thì bàn giao; chưa đạt thì trả lại thợ |
| Đã bàn giao | **Đóng lệnh** | Xong hết việc với lệnh. Lệnh đã thu đủ thì rời bảng ngay khi bàn giao, bản này chưa mở lại được để đóng. |

## Báo chờ

Khi lệnh đã duyệt mà phải dừng (chờ phụ tùng, chờ khách duyệt thêm, chờ cầu nâng):

1. Bấm **Báo chờ**, chọn lý do, ghi chú nếu cần (ví dụ "nhà cung cấp hẹn giao 15:00").
2. Bấm **Bắt đầu chờ**. Thẻ xe trên bảng điều phối chuyển vạch cam.
3. Hết chờ thì bấm **Hết chờ, làm tiếp** trên dải cam. Trong lúc chờ, các nút chuyển bước bị ẩn.

## Thu tiền QR

Nút **Thu tiền QR** hiện khi lệnh còn tiền phải thu. Các bước giống hướng dẫn của [thu ngân](thu-ngan.md#thu-tiền-bằng-mã-qr).

## Lưu ý

- Hai người cùng sửa một lệnh: người lưu sau được báo "Có người vừa sửa lệnh này", phần mềm tự tải lại, bạn thao tác lại.
- Lệnh đã thu đủ tiền thì tự khóa, nút **Thêm hạng mục** biến mất. Cần sửa thì nhờ quản lý mở lại.
- Hủy lệnh: nhờ quản lý hoặc chủ gara.
