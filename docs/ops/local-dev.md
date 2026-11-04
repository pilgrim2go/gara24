# Cài đặt và chạy trên máy

Yêu cầu: Node.js 22 trở lên, git, make.

```bash
git clone https://github.com/<user>/gara24 && cd gara24
make install          # npm ci, đúng phiên bản trong lockfile
make test             # xóa D1 local, áp migration, chạy test
cp .dev.vars.example .dev.vars   # rồi sửa PROBE_TOKEN
make dev              # Worker ở http://localhost:8787
```

Khi chạy local có thể bật `DEV_AUTH=1` trong `.dev.vars` để đăng nhập bằng header `x-dev-user-email`. Không bao giờ đặt biến này trên môi trường deploy.

D1 local nằm ở `.wrangler/state`; `make db-reset` xóa và tạo lại.
