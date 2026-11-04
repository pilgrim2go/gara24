# Worker thăm dò

Dùng để đo những gì D1 local không mô phỏng được, chủ yếu là giới hạn truy vấn mỗi lần gọi Worker trên gói Free. `wrangler dev` không áp giới hạn này, nên chỉ đo trên Worker đã deploy. Dùng database demo, không dùng database chứa dữ liệu thật.

Đi qua Access bằng service token (xem bước 5.4 của [cloudflare-free.md](cloudflare-free.md)), rồi:

```bash
make cf-probe-on CONFIRM=yes     # PROBE_TOKEN ngẫu nhiên, đặt secret, lưu vào .wrangler/deploy/demo.env
make cf-probe                    # gọi /probe/limits ở n=60 và n=200, in kết luận
make cf-probe-off CONFIRM=yes    # xóa secret
```

Lệnh lẻ vẫn dùng được: `make probe-limits N=60`, `make probe-scenario`. `probe-scenario` GHI một chi nhánh thử vào database; `probe-limits` chỉ chạy `SELECT 1`.

## Vì sao phải đo

Hai nguồn của Cloudflare đang lệch nhau. Trang giới hạn D1 ghi 50 truy vấn mỗi lần gọi Worker trên gói Free. Changelog ngày 11/02/2026 ghi gói Free được 50 subrequest ra ngoài và 1.000 subrequest tới dịch vụ Cloudflare; D1 là dịch vụ Cloudflare.

## Đọc kết quả

`/probe/limits?n=N` chạy một `db.batch()` gồm N câu, rồi N truy vấn riêng lẻ, trong cùng một lần gọi. Code giới hạn N tối đa 200.

| Kết quả | Kết luận |
| --- | --- |
| `batchOfN.ok = true`, `separateQueries.failedAfter` khoảng 49 | Trần 50 đang áp dụng; một batch tính là 1 truy vấn. Thiết kế giữ nguyên |
| `batchOfN.ok = true`, `separateQueries.ok = true` ở n=60 | Trần 50 không áp dụng cho D1. Xem tiếp n=200 để biết trần lớn hơn 200 hay không |
| `batchOfN.ok = false` | Mỗi câu trong batch tính riêng; gói Free chỉ đủ khoảng 3 lần xuất kho mỗi request, cần Workers Paid trước khi demo |
| Báo Access chặn | Thiếu chính sách Service Auth hoặc service token hết hạn |
| Báo `unauthorized` | Chưa `make cf-probe-on`, hoặc `PROBE_TOKEN` trong demo.env đã cũ |

`scripts/probe-verdict.mjs` in kết luận theo bảng trên. Chép nguyên JSON vào `docs/design/spike-results.md` (làn design).
