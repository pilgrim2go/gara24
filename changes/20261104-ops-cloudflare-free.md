---
lane: ops
docs-impact: none
---

- Deploy demo lên Cloudflare gói Free: `make cf-d1`, `cf-access`, `cf-seed`, `cf-user`, `cf-check`, `cf-probe-on/cf-probe/cf-probe-off`; hướng dẫn từng bước ở docs/ops/cloudflare-free.md.
- Lệnh môi trường thật dùng cấu hình sinh ở `.wrangler/deploy/wrangler.json` (điền `database_id` thật, tắt Preview URLs) thay vì sửa `wrangler.jsonc`. `probe-*` gửi kèm service token Access khi có.
- Yêu cầu cho làn core: thêm `/health` vào `run_worker_first`; cho route giả lập ngân hàng chạy được sau Access ở chế độ demo (vd chỉ vai owner). Làn web: báo rõ "email chưa được gán người dùng" thay vì rơi về màn chọn người dùng demo.
