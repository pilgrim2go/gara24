# Secret và biến môi trường

| Tên | Loại | Đặt bằng |
| --- | --- | --- |
| `ACCESS_TEAM_DOMAIN` | secret | `make cf-access TEAM=<team>.cloudflareaccess.com AUD=... CONFIRM=yes` |
| `ACCESS_AUD` | secret | cùng lệnh trên; Application Audience tag của ứng dụng Access |
| `PROBE_TOKEN` | secret, chỉ khi cần đo | `make cf-probe-on CONFIRM=yes`; xóa bằng `make cf-probe-off CONFIRM=yes` ngay sau khi đo |
| `BANK_WEBHOOK_SECRET` | secret | `npx wrangler -c .wrangler/deploy/wrangler.json secret put BANK_WEBHOOK_SECRET` |
| `WEBHOOK_BRANCH_ID` | secret hoặc biến | chi nhánh nhận giao dịch ngân hàng không ghép được |
| `DEV_AUTH` | chỉ trong `.dev.vars` local | không bao giờ đặt trên môi trường deploy |

`ACCESS_*` không phải bí mật nhưng vẫn đặt bằng secret: `wrangler deploy` xóa mọi biến thường đặt trên dashboard mà file cấu hình không có, còn secret giữ nguyên qua các lần deploy.

`secret put` cần Worker đã tồn tại, nên deploy lần đầu trước khi đặt secret. Worker lúc đó ở trạng thái đóng (không có `ACCESS_*` thì `/api/*` trả 401).

Trên máy vận hành, `.wrangler/deploy/demo.env` (quyền 600, không commit) giữ URL, service token Access và `PROBE_TOKEN` để các lệnh `make cf-*` dùng lại.

Không ghi secret vào file trong repo. Repo công khai.
