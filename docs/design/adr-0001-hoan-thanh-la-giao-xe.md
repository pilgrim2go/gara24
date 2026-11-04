# ADR-0001: Hoàn thành lệnh = lần đầu sang `delivered`

- Trạng thái: đã áp dụng (commit `e5d1a61`, migration `0004_completed_backfill.sql`)
- Ngày: 04/11/2026
- Phạm vi: mốc ghi nhận doanh thu và giá vốn cho báo cáo quản trị (dashboard ngày, lãi gộp tháng)

## Bối cảnh

Dashboard cần trả lời "hôm nay, tháng này xưởng làm ra bao nhiêu lãi gộp". Phải chọn một mốc để gom doanh thu và giá vốn của lệnh. Các ứng viên:

| Mốc | Vấn đề |
| --- | --- |
| Lúc tạo lệnh hoặc duyệt báo giá | Doanh thu chưa chắc chắn: lệnh còn sửa dòng, còn hủy được |
| Lúc QC đạt | QC có thể quay lại `in_progress` (`qc → in_progress` là chuyển hợp lệ), một lệnh sẽ "hoàn thành" nhiều lần |
| Lúc thu đủ tiền (khóa lệnh) | Lệnh công nợ của bảo hiểm, khách doanh nghiệp treo nhiều tuần; doanh thu tháng lệch về tháng thu tiền. Dòng tiền đã có `collected_vnd` riêng |
| Lúc đóng lệnh (`closed`) | Phụ thuộc thói quen bấm đóng của cố vấn, dễ dồn cuối tháng |
| **Lần đầu sang `delivered`** | Chọn |

## Quyết định

Lệnh **hoàn thành** tại thời điểm nó chuyển sang `delivered` **lần đầu tiên**. Trong cùng `db.batch()` của thao tác chuyển trạng thái:

1. Cộng 1 lệnh, doanh thu công, doanh thu phụ tùng, giảm giá, giá vốn (`work_order_costs.parts_cost_vnd`) và phần giá vốn tạm tính vào `daily_branch_stats` theo `biz_date` giờ VN của lúc giao.
2. Ghi `completed_at`, `completed_biz_date` vào `work_orders`.

Điều kiện "lần đầu" là `completed_at IS NULL`. Câu cộng thống kê phải chạy trước câu `UPDATE`, vì nó dựa vào `completed_at` còn `NULL`. Lệnh đã giao trước bản này được migration 0004 bù, lấy mốc từ `MIN(at)` của sự kiện `status → delivered` trong `work_order_events`.

## Lý do

- **Số liệu đã đóng băng.** Ở `delivered` lệnh không còn sửa dòng (`ORDER_NOT_EDITABLE`), không xuất kho được (chỉ `approved`, `in_progress`, `qc`), không hủy được (`ORDER_NOT_CANCELLABLE`). Doanh thu và giá vốn chụp lúc giao là số cuối cùng, trừ khi chạy lại giá vốn (xem Hệ quả).
- **Khớp nghiệp vụ.** Giao xe là lúc khách nhận dịch vụ, cũng là mốc ghi doanh thu thường dùng khi kế toán xuất hóa đơn.
- **Tách dòng tiền khỏi lãi gộp.** Doanh thu theo ngày giao, tiền theo ngày thu (`collected_vnd`). Chủ gara thấy cả hai, không bị trộn.
- **"Lần đầu" thay vì "mỗi lần".** Hiện không có chuyển `delivered → *` ngoài `closed`, và mở lại (`reopen`) chỉ bỏ khóa, không đổi trạng thái. Nhưng nếu sau này thêm luồng xe quay lại bảo hành hay sửa tiếp, điều kiện `completed_at IS NULL` bảo đảm một lệnh chỉ được tính một lần. Thao tác cũng an toàn khi gửi lặp.

Quyết định này **không** chốt mốc tính hoa hồng. "Hoa hồng lúc hoàn thành hay lúc thu tiền" vẫn để mở trong AGENTS.md; khi làm lương, mốc đó đọc từ `settings` và có thể dùng `completed_at` hoặc ngày thu tiền.

## Hệ quả

- `daily_branch_stats` giữ **số chụp** lúc giao, không tự tính lại. Bất biến mới trong `src/invariants.ts` so từng ngày: số trong `daily_branch_stats` phải bằng tổng các lệnh có cùng `completed_biz_date`.
- **Chạy lại giá vốn sau này phải điều chỉnh thống kê.** Khi làm bình quân cuối kỳ (`cost_runs`), `parts_cost_vnd` của lệnh đã giao sẽ đổi, `cost_status` chuyển từ `provisional` sang `final`. Batch chạy lại giá vốn phải cộng phần chênh vào `cogs_completed_vnd` và trừ phần tạm tính khỏi `cogs_provisional_vnd` ở đúng `completed_biz_date` của từng lệnh. Nếu quên, bất biến báo lệch ngay ở lần chạy kế tiếp; đó là chủ ý, đừng nới bất biến cho qua.
- Lãi gộp tháng gồm cả giá vốn tạm tính. Giao diện nên hiện `cogs_provisional_vnd` cạnh lãi gộp để người xem biết số chưa chốt.
- Lệnh đổi số tiền sau khi giao (nếu sau này cho phép điều chỉnh sau giao) cũng phải đi kèm điều chỉnh `daily_branch_stats`, cùng lý do như trên.

## Khoảng trống đã biết

| # | Khoảng trống | Ở đâu | Ảnh hưởng | Hướng xử lý đề xuất |
| --- | --- | --- | --- | --- |
| K1 | Gia công ngoài (sublet) chưa có giá vốn | `work_order_costs.sublet_cost_vnd` có trong schema nhưng không thao tác nào ghi; thống kê hoàn thành chỉ cộng `parts_cost_vnd` | Lệnh có dòng `sublet` bị thổi phồng lãi gộp bằng đúng tiền trả bên gia công | Ghi `sublet_cost_vnd` khi nhập hóa đơn bên gia công; cộng vào giá vốn hoàn thành; mở rộng bất biến |
| K2 | Lãi gộp chưa trừ lương | `MonthlyStatsView` chỉ có doanh thu − giá vốn phụ tùng | Lương thợ là chi phí lớn nhất của xưởng dịch vụ; "lãi gộp" hiện cao hơn lãi thực nhiều | Giai đoạn lương: thêm chi phí lương theo tháng (từ bảng lương, không từ MISA), báo cáo tách "lãi gộp" và "lãi sau lương" |
| K3 | Kỳ đã khóa không chặn ghi thống kê khi giao xe | Trigger khóa kỳ chỉ có trên `stock_moves` và `payments`; `transition` không kiểm `accounting_periods` | Giao xe với giờ hệ thống thuộc tháng đã khóa (hoặc chạy lại migration 0004) làm đổi số của kỳ đã báo cáo | Thêm guard `PERIOD_CLOSED` trong `transition` khi sang `delivered`, hoặc trigger trên `daily_branch_stats`; cần quyết định xử lý xe giao trễ sau khi khóa kỳ (ghi vào kỳ mở kế tiếp) |
| K4 | Tên người lấy lúc đọc | `ACTOR_NAME` trong `src/api/routes.ts` JOIN `users.full_name` khi trả `/audit` và `events` | Đổi tên một nhân viên thì nhật ký cũ hiện tên mới. `audit_log` vẫn đúng ở `actor_id`, nhưng bản in nhật ký không còn phản ánh đúng lúc ghi | Nếu cần giá trị chứng cứ: chụp tên vào `audit_log`/`work_order_events` lúc ghi (cột mới, không sửa dòng cũ), hoặc lưu lịch sử tên trong bảng riêng. Ở mức demo chấp nhận được |
