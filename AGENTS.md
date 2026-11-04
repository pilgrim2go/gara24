# AGENTS.md: quy ước cho mọi phiên làm việc với Claude

Đọc hết file này trước khi sửa repo. Mọi thay đổi gửi về dưới dạng một patch (`git format-patch --base=<commit>`).

## Bối cảnh

- Gara sửa ô tô, dưới 10 người, 1 cơ sở. Kế toán dùng MISA. Lương kết hợp nhiều cách.
- MISA giữ sổ sách, BHXH, thuế TNCN; app lo nghiệp vụ xưởng và báo cáo quản trị; chứng từ đi một chiều app → MISA.
- Làm theo 4 giai đoạn; hiện ở giai đoạn 1 (kiểm soát tiền, đồ và nền kế toán), mức demo.
- Chưa chốt: công ty hay hộ kinh doanh; hoa hồng lúc hoàn thành hay lúc thu tiền; cách tính giá vốn trong MISA; tỷ trọng doanh thu bảo hiểm và khách doanh nghiệp. KHÔNG tự chốt: thiết kế để đổi qua `settings`.
- Ở mức demo: làm theo đề xuất của Claude, không cần hỏi chủ gara trừ khi là blocker.
- Thiết kế gốc: xem [docs/design/README.md](docs/design/README.md).

## Quy tắc dữ liệu (không được phá)

Tiền là số nguyên VND (`_vnd`); số lượng phần nghìn (`_m`); thời gian ms UTC (`_at`) kèm `biz_date` giờ Việt Nam; không xóa dữ liệu nghiệp vụ, chỉ hủy kèm lý do; mọi bảng có `branch_id`; `audit_log` chỉ ghi thêm; cố vấn và thợ không bao giờ thấy giá vốn; mỗi thao tác ghi là đúng một `db.batch()`; mỗi câu SQL chỉ dùng một kiểu tham số (`?` hoặc `?N`).

## Làn (lane): chống xung đột khi nhiều chat chạy song song

Mỗi chat làm đúng một làn và chỉ sửa file thuộc làn đó. Bản đồ chính thức nằm ở [.lanes](.lanes); kiểm bằng `scripts/check-lanes.sh`.

| Làn | Đường dẫn | Ghi chú |
| --- | --- | --- |
| core | `src/`, `migrations/`, `test/`, `package.json`, `package-lock.json`, `wrangler.jsonc`, `drizzle.config.ts` | Chỉ một chat core tại một thời điểm, vì migration và lockfile đánh số tuần tự |
| ops | `Makefile`, `scripts/`, `docs/ops/` | Không sửa `package.json`; cần script npm mới thì ghi yêu cầu vào mẩu changelog cho làn core |
| user | `docs/user/` | Mô tả theo vai và luồng nghiệp vụ, không dùng thuật ngữ kỹ thuật |
| design | `docs/design/` | Ghi chú thiết kế, kết quả thử nghiệm, link Claude Docs |
| meta | `README.md`, `AGENTS.md`, `.lanes`, `docs/README.md`, `.gitignore` | Chỉ sửa khi prompt ghi rõ làn meta |

Thư mục `changes/` dùng chung: mỗi patch THÊM đúng một file mới, không bao giờ sửa file của patch khác.

## Quy trình một patch

1. Clone repo, kiểm `git rev-parse HEAD` trùng commit gốc ghi trong prompt. Không trùng thì dừng và báo.
2. Phản biện ý tưởng và nêu yêu cầu (tiêu chí đạt) trước khi sửa.
3. Kiểm CVE cho mọi gói mới hoặc đổi phiên bản (`npm audit`, chọn bản đã phát hành từ 14 ngày trở lên).
4. Chỉ sửa file trong làn được giao; thêm một mẩu `changes/YYYYMMDD-<làn>-<slug>.md`.
5. Chạy `make test` và `scripts/check-lanes.sh HEAD~1..HEAD` (patch nhiều commit: `<gốc>..HEAD`).
6. `git format-patch --base=<gốc> <gốc>..HEAD`; gửi file `.patch` kèm tóm tắt ngắn.

Thay đổi hành vi (làn core) mà tài liệu cần cập nhật: ghi `docs-impact: ops` hoặc `docs-impact: user` trong mẩu changelog để chat của làn đó xử lý.

## Viết

Tiếng Việt, câu ngắn, có số liệu cụ thể. Không đưa secret vào repo; secret đặt bằng `wrangler secret put`.
