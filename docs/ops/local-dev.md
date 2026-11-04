# Cài đặt và chạy trên máy

Yêu cầu: Node.js 22 trở lên, git, make.

```bash
git clone https://github.com/<user>/gara24 && cd gara24
make install                       # npm ci cho Worker và giao diện
make test                          # xóa D1 local, áp migration, chạy test
cp .dev.vars.example .dev.vars     # có sẵn DEV_AUTH="1" cho chế độ demo
make dev                           # build giao diện rồi chạy Worker ở http://localhost:8787
make seed-demo                     # ở terminal khác: nạp dữ liệu mẫu
```

Mở http://localhost:8787, chọn một người trong xưởng để xem phần mềm theo vai của họ. Đổi người bằng nút "Đổi người".

Sửa giao diện có tự tải lại: giữ `make dev` chạy, mở thêm `make web-dev` và dùng http://localhost:5173 (Vite chuyển tiếp API sang :8787).

`wrangler dev` báo thiếu thư mục `web/dist` nghĩa là chưa build giao diện: chạy `make web-build`. D1 local nằm ở `.wrangler/state`; `make db-reset` xóa và tạo lại, sau đó `make seed-demo`.

`DEV_AUTH=1` cho phép đăng nhập bằng header `x-dev-user-email` và bật các route `/dev/*`. Các route này tự tắt khi Worker có `ACCESS_TEAM_DOMAIN`. Không bao giờ đặt `DEV_AUTH` trên môi trường deploy.
