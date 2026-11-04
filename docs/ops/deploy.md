# Deploy

```bash
npx wrangler login
npx wrangler d1 create gara24        # một lần; chép database_id vào wrangler.jsonc (làn core)
make migrate-remote CONFIRM=yes      # tự sao lưu trước khi áp migration
make deploy CONFIRM=yes              # audit + test + kiểm làn + build giao diện rồi mới deploy
```

Trước lần deploy đầu: đặt secret theo [secrets.md](secrets.md) và đặt Cloudflare Access trước Worker (ứng dụng self-hosted, chính sách theo email nhân viên). Ghi `ACCESS_TEAM_DOMAIN` và `ACCESS_AUD` vào biến môi trường của Worker.

Worker phục vụ luôn giao diện trong `web/dist` (Workers static assets); các đường dẫn `/api/*`, `/dev/*`, `/webhooks/*`, `/probe/*` luôn vào Worker trước.

Gói Free dùng khi phát triển; lên Workers Paid khi dùng thật (xem [probe.md](probe.md) về giới hạn truy vấn).
