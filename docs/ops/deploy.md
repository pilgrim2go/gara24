# Deploy

Bản demo trên gói Free, từng bước kèm Access và đo giới hạn: [cloudflare-free.md](cloudflare-free.md).

Tóm tắt các lệnh, theo thứ tự:

```bash
make cf-login
make cf-d1 CONFIRM=yes               # tạo D1 nếu chưa có, sinh .wrangler/deploy/wrangler.json
make migrate-remote CONFIRM=yes      # tự sao lưu trước khi áp migration
make deploy CONFIRM=yes              # audit + test + kiểm làn + build giao diện rồi mới deploy
make cf-access TEAM=... AUD=... CONFIRM=yes   # sau khi bật Access cho workers.dev
```

`wrangler.jsonc` trong repo giữ `database_id` giữ chỗ. Lệnh môi trường thật dùng cấu hình sinh ra ở `.wrangler/deploy/wrangler.json` (không commit); kéo code mới có đổi `wrangler.jsonc` thì chạy lại `make cf-config`.

Trước khi mở cho người dùng: Cloudflare Access phải đứng trước Worker và `make cf-check` đạt. Secret theo [secrets.md](secrets.md).

Worker phục vụ luôn giao diện trong `web/dist` (Workers static assets); các đường dẫn `/api/*`, `/dev/*`, `/webhooks/*`, `/probe/*` luôn vào Worker trước.

Gói Free dùng khi phát triển; lên Workers Paid khi dùng thật (xem [probe.md](probe.md) về giới hạn truy vấn).
