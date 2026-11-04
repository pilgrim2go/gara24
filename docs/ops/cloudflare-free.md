# Deploy bản demo lên Cloudflare gói Free

Mục tiêu: một Worker trên `workers.dev`, có Cloudflare Access chặn phía trước, một D1 riêng chứa dữ liệu demo, và kết quả đo trần truy vấn của gói Free. Khoảng 30 phút cho lần đầu.

Mọi lệnh chạm tài khoản thật đòi `CONFIRM=yes`. Lệnh có số thứ tự trong `make` khớp với các bước dưới đây.

## Trước khi bắt đầu

- Tài khoản Cloudflare gói Free. Máy có Node 20 trở lên, đã `make install` và `make test` xanh.
- Zero Trust: lần đầu mở Zero Trust, Cloudflare bắt chọn tên team (thành `<team>.cloudflareaccess.com`) và gói. Chọn gói Free (tối đa 50 người dùng). Cloudflare có thể hỏi phương thức thanh toán dù gói 0 USD.
- Không dùng database này cho dữ liệu thật của gara. Bản demo nằm trên gói Free; dùng thật thì lên Workers Paid.

## Vì sao không sửa `wrangler.jsonc`

Mỗi gara một D1 riêng, nên `database_id` không thuộc về repo công khai. Sửa `wrangler.jsonc` tại chỗ còn làm bẩn cây làm việc và chặn `make patch-apply`.

`make cf-config` đọc `wrangler.jsonc`, điền `database_id` thật, tắt Preview URLs, rồi ghi ra `.wrangler/deploy/wrangler.json` (đã nằm trong `.gitignore`). Mọi lệnh môi trường thật (`migrate-remote`, `deploy`, `d1-backup`, `cf-*`) dùng file này. Sau khi kéo code mới có đổi `wrangler.jsonc`, chạy lại `make cf-config`.

URL Worker, service token Access và `PROBE_TOKEN` lưu ở `.wrangler/deploy/demo.env` (quyền 600, chỉ trên máy vận hành). Makefile tự đọc file này; biến trên dòng lệnh vẫn thắng.

## Các bước

### 1. Đăng nhập

```bash
make cf-login
```

`wrangler whoami` phải in đúng tài khoản. Có nhiều tài khoản thì đặt `CLOUDFLARE_ACCOUNT_ID` trước khi chạy các lệnh sau.

### 2. Tạo D1 và sinh cấu hình

```bash
make cf-d1 CONFIRM=yes                   # DB=gara24, vùng apac (gần TP HCM)
```

Đã có D1 cùng tên thì lệnh chỉ sinh cấu hình. Gói Free cho tối đa 10 database, mỗi database 500 MB, Time Travel 7 ngày.

### 3. Áp migration

```bash
make migrate-remote CONFIRM=yes          # tự sao lưu vào backups/ trước khi áp
```

### 4. Deploy

```bash
make deploy CONFIRM=yes                  # audit + test + kiểm làn + build giao diện rồi deploy
make cf-env URL=https://gara24-d1-spike.<subdomain>.workers.dev
```

URL lấy từ dòng cuối của `wrangler deploy`. Lúc này Worker đang ở trạng thái đóng: chưa có `ACCESS_*` nên mọi `/api/*` trả 401, chưa có `DEV_AUTH` nên `/dev/*` trả 404. Nếu `wrangler deploy` báo cấu hình trên dashboard khác file local và hỏi có cập nhật file không, chọn không.

### 5. Bật Access trước Worker

Tên menu trên dashboard có thể đổi theo thời gian; tìm theo ý.

1. Dashboard, **Workers & Pages**, chọn Worker, **Settings**, **Domains & Routes**. Ở dòng `workers.dev`, bấm **Enable Cloudflare Access**.
2. Hộp thoại hiện team domain và AUD (Application Audience tag). Đặt chúng làm secret:

   ```bash
   make cf-access TEAM=<team>.cloudflareaccess.com AUD=<chuỗi 64 ký tự hex> CONFIRM=yes
   ```

   Lệnh tự bỏ `https://` nếu dán cả URL. Đặt bằng secret chứ không phải biến thường, vì `wrangler deploy` xóa mọi biến đặt trên dashboard không có trong file cấu hình.
3. Bấm **Manage Cloudflare Access**. Trong chính sách `<worker> - Production`, liệt kê email những người được vào demo. Cách đăng nhập mặc định là mã một lần gửi qua email (One-time PIN).
4. Tạo service token cho các lệnh đo (curl không đăng nhập bằng email được): Zero Trust, **Access**, **Service credentials**, **Service Tokens**, tạo token, chọn thời hạn ngắn nhất đủ dùng. Chép Client ID và Client Secret (Secret chỉ hiện một lần). Thêm vào ứng dụng Access của Worker một chính sách hành động **Service Auth**, điều kiện **Service Token** là token vừa tạo.

   ```bash
   make cf-env ACCESS_CLIENT_ID=<...>.access ACCESS_CLIENT_SECRET=<...>
   ```

### 6. Nạp dữ liệu demo

```bash
make cf-seed CONFIRM=yes
```

Lệnh chạy Worker trên máy (`wrangler dev`) với D1 trỏ vào database thật và `DEV_AUTH=1`, gọi `/dev/seed`, rồi tắt. `DEV_AUTH` chỉ có trong tiến trình local đó. Code chạy trên máy nên không vướng trần truy vấn của gói Free. Chạy lại không nạp trùng (`"seeded": false`).

Dữ liệu: chi nhánh "Gara Quận 7", 9 người dùng mẫu (chủ gara, quản lý, cố vấn, 2 thợ, thủ kho, thu ngân, kế toán, nhà đầu tư), 6 xe, 8 phụ tùng, vài lệnh đang làm.

### 7. Gán email đăng nhập cho người dùng mẫu

Người dùng mẫu có email `<mã>@demo.gara24`, không đăng nhập Access được. Gán email thật:

```bash
make cf-users                                            # xem mã và email hiện tại
make cf-user EMAIL=van+chu@gmail.com AS=chu CONFIRM=yes
make cf-user EMAIL=van+tho@gmail.com AS=tho.tuan CONFIRM=yes
```

Mã `AS`: `chu quanly covan tho.tuan tho.hai kho thungan ketoan ndt`. Mỗi email chỉ gán cho một người. Một người muốn thử nhiều vai thì dùng địa chỉ có dấu cộng của Gmail: mỗi `van+<vai>@gmail.com` là một email riêng với Access nhưng thư vẫn về một hộp. Email phải có trong chính sách Access ở bước 5.3.

### 8. Kiểm cổng vào

```bash
make cf-check
```

Kết quả đạt: 6 dòng OK.

| Kiểm | Mong đợi | Nghĩa |
| --- | --- | --- |
| `GET /api/me`, `POST /probe/limits`, `GET /` không danh tính | 302 sang `*.cloudflareaccess.com` | Access chặn trước Worker, kể cả giao diện và route đo |
| `/probe/limits` bằng service token, không `PROBE_TOKEN` | 401 từ Worker | Service token qua được Access; route đo vẫn đòi token riêng |
| `/dev/users` bằng service token | 404 | Route demo đã tắt trên môi trường thật |
| `/api/me` bằng service token | 401 | Worker tự kiểm JWT; token máy không có email nên không thành người dùng |

Rồi mở URL trên trình duyệt, đăng nhập bằng email đã gán ở bước 7, thấy bảng điều phối của đúng vai.

### 9. Đo trần 50 truy vấn

```bash
make cf-probe-on CONFIRM=yes     # sinh PROBE_TOKEN ngẫu nhiên, đặt secret, lưu vào demo.env
make cf-probe                    # đo ở n=60 và n=200, in kết luận
make cf-probe-off CONFIRM=yes    # xóa secret ngay sau khi đo
```

Cách đọc kết quả ở [probe.md](probe.md). Chép nguyên JSON và kết luận vào `docs/design/spike-results.md` qua một chat làn design.

## Giới hạn gói Free liên quan

| Giới hạn | Gói Free | Ảnh hưởng |
| --- | --- | --- |
| Request Worker | 100.000 mỗi ngày | Đủ cho demo |
| CPU mỗi request | 10 ms | Kiểm JWT RS256 dùng WebCrypto, nhẹ |
| Truy vấn D1 mỗi lần gọi Worker | 50 theo trang giới hạn D1 | Đây là thứ `cf-probe` đo |
| Subrequest tới dịch vụ Cloudflare | 1.000 theo changelog 11/02/2026 | Mâu thuẫn với dòng trên, nên phải đo thật |
| D1 | 10 database, 500 MB mỗi database, Time Travel 7 ngày | Sao lưu bằng `make d1-backup` |

Nguồn: developers.cloudflare.com/d1/platform/limits, developers.cloudflare.com/workers/platform/limits, changelog "Workers are no longer limited to 1000 subrequests". Kiểm lại trước mỗi lần demo vì Cloudflare đổi giới hạn.

## Hạn chế đã biết của bản demo trên Cloudflare

- Nút giả lập ngân hàng trong màn thu QR gọi `/dev/simulate-bank`, trả 404 khi đã có Access. Thu QR chỉ demo được trên máy (`make dev`).
- Email đăng nhập chưa gán cho người dùng nào thì giao diện rơi về màn chọn người dùng demo và báo lỗi (màn đó gọi `/dev/users`). Gán email ở bước 7.
- Access một chạm che toàn bộ host, gồm cả `/webhooks/*`: ngân hàng thật không gọi vào được. Khi tích hợp ngân hàng cần tên miền riêng và ứng dụng Access theo đường dẫn, có chính sách Bypass cho `/webhooks/*`.
- `/health` không nằm trong `run_worker_first` nên trả trang giao diện thay vì JSON.

## Dọn sau demo

Không có lệnh make cho việc này để tránh bấm nhầm. Sao lưu trước (`make d1-backup`), rồi:

1. Tắt Access ở **Domains & Routes**; thu hồi service token trong Zero Trust.
2. `npx wrangler delete -c .wrangler/deploy/wrangler.json`
3. `npx wrangler d1 delete gara24`
4. `rm -rf .wrangler/deploy`

## Sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| `Chưa có .wrangler/deploy/wrangler.json` | Chưa sinh cấu hình trên máy này | `make cf-config` (hoặc `make cf-d1 CONFIRM=yes` lần đầu) |
| `secret put` hỏi có tạo Worker mới không | Chưa deploy | Làm bước 4 trước bước 5 |
| Trình duyệt đăng nhập được nhưng giao diện báo lỗi người dùng | Email chưa gán, hoặc gõ hoa thường khác | `make cf-users`, rồi `make cf-user` |
| `/api/*` luôn 401 dù đã đăng nhập | Sai `ACCESS_AUD` hoặc team domain | Chạy lại `make cf-access` với giá trị trong hộp thoại Access |
| `cf-probe` báo Access chặn | Thiếu chính sách Service Auth, hoặc token hết hạn | Bước 5.4 |
| `cf-seed` treo 120 giây rồi lỗi | Chưa áp migration lên D1 thật | `make migrate-remote CONFIRM=yes` |
