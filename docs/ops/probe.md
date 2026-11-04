# Worker thăm dò

Dùng để đo những gì D1 local không mô phỏng được, chủ yếu là giới hạn 50 truy vấn mỗi lần gọi Worker trên gói Free. Dùng database riêng, không dùng database chứa dữ liệu thật.

```bash
npx wrangler secret put PROBE_TOKEN
make probe-scenario URL=https://<worker>.workers.dev PROBE_TOKEN=<token>
make probe-limits   URL=https://<worker>.workers.dev PROBE_TOKEN=<token> N=60
```

Đọc kết quả `probe-limits`:

- `separateQueries.failedAfter` khoảng 50: giới hạn 50 truy vấn đang áp dụng.
- `batchOfN.ok = true`: một batch tính là một truy vấn; thiết kế giữ nguyên.
- `batchOfN.ok = false`: mỗi câu trong batch tính riêng; gói Free chỉ đủ khoảng 3 lần xuất kho mỗi request, cần Workers Paid trước khi demo.

Đo xong: `npx wrangler secret delete PROBE_TOKEN`.
