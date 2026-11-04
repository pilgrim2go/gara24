# Secret và biến môi trường

| Tên | Loại | Đặt bằng |
| --- | --- | --- |
| `BANK_WEBHOOK_SECRET` | secret | `npx wrangler secret put BANK_WEBHOOK_SECRET` |
| `PROBE_TOKEN` | secret, chỉ khi cần đo | `npx wrangler secret put PROBE_TOKEN`; xóa sau khi đo |
| `ACCESS_TEAM_DOMAIN` | biến | vd `gara24.cloudflareaccess.com` |
| `ACCESS_AUD` | biến | Application Audience tag của ứng dụng Access |
| `WEBHOOK_BRANCH_ID` | biến | chi nhánh nhận giao dịch ngân hàng không ghép được |
| `DEV_AUTH` | chỉ trong `.dev.vars` local | không bao giờ đặt trên môi trường deploy |

Không ghi secret vào file trong repo. Repo công khai.
