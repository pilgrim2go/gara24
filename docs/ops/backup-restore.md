# Sao lưu và khôi phục (G1-17)

Hai lớp:

1. **Time Travel của D1**: khôi phục về một thời điểm trong 7 ngày (Free) hoặc 30 ngày (Workers Paid). Dùng khi lỡ chạy sai thao tác.
2. **Bản xuất SQL**: `make d1-backup` ghi `backups/gara24-<thời điểm>.sql`. Thư mục `backups/` không vào git. Chép bản xuất ra nơi gara kiểm soát.

Khôi phục từ Time Travel:

```bash
npx wrangler d1 time-travel info gara24
npx wrangler d1 time-travel restore gara24 --timestamp=<ISO 8601>
```

Chưa làm: sao lưu tự động hằng ngày ra R2 bằng Cron Trigger, và tập lệnh khôi phục từ file SQL. Kiểm tra cú pháp lệnh time-travel theo bản wrangler đang dùng trước khi chạy.
