# Kết quả thử nghiệm D1 và API (vòng 1, 2)

Bản ghi lịch sử, giữ nguyên nội dung README ở commit `base-0.2`, trừ mục **API** được cập nhật đến commit `e5d1a61` (dòng và trường mới ghi *(mới)*). Lệnh vận hành hiện hành nằm ở [docs/ops](../ops/README.md). Quyết định thiết kế sau vòng 2 nằm ở các file `adr-*.md` trong thư mục này.

Mục tiêu: xác nhận các kỹ thuật trong tài liệu "gara24 — Mô hình dữ liệu D1 giai đoạn 1" chạy được trên D1 trước khi viết tiếp: trigger trong migration, bảng `_guard`, `UPDATE … FROM`, `json_each`, và bốn thao tác nguyên tử (cấp số lệnh, xuất kho theo lệnh, hủy lệnh hoàn kho, thu tiền và khóa lệnh).

## Tiêu chí đạt (đặt trước khi viết code)

| # | Tiêu chí | Cách kiểm | Kết quả local |
| --- | --- | --- | --- |
| 1 | Migration có trigger `BEGIN … END` áp được bằng `wrangler d1 migrations apply` | 3 migration, 32 trigger | Đạt |
| 2 | Guard hỏng giữa batch thì rollback cả các câu trước, API đọc được mã lỗi | test A1, A2 | Đạt |
| 3 | `UPDATE … FROM`, `json_each`, `RETURNING` chạy trong batch | test C, D, E | Đạt |
| 4 | Số lệnh không trùng, không lỗ, kể cả khi gọi song song và khi batch hỏng | test B1–B5 (20 yêu cầu song song) | Đạt |
| 5 | Xuất kho: giá bình quân đúng, chặn xuất quá tồn và quá số lượng trên lệnh, gửi lặp không trừ hai lần | test C1–C7 | Đạt |
| 6 | Hủy lệnh hoàn kho theo giá vốn gốc; đã thu tiền thì bắt chọn hoàn hoặc trả trước | test D1–D5 | Đạt (sau khi sửa 1 lỗi, xem dưới) |
| 7 | Thu đủ thì khóa; trigger chặn sửa kể cả SQL trực tiếp; webhook gửi lại không ghi hai lần | test E1–E6 | Đạt |
| 8 | Kỳ đã khóa không ghi được kho và tiền | test F1 | Đạt |
| 9 | Batch nhiều câu có bị tính vào giới hạn 50 truy vấn/lần gọi (gói Free) không | `/probe/limits` trên D1 thật | **Chưa đo**: local không mô phỏng giới hạn này |

Kết quả: 27/27 test thao tác đạt trên D1 local (workerd), và `/probe/scenario` đạt 15/15 bước khi chạy bằng `wrangler dev`.

## Vòng 2: Drizzle schema đầy đủ và API theo vai

**Yêu cầu đặt trước khi làm**

| # | Yêu cầu | Kiểm bằng | Kết quả |
| --- | --- | --- | --- |
| R1 | Drizzle schema phủ đủ 48 bảng của nhóm A–G; migration sinh từ schema chạy được cùng 27 test cũ mà không sửa thao tác | `drizzle-kit generate` rồi chạy lại toàn bộ test | Đạt |
| R2 | Enum được kiểm ở DB, không chỉ ở TypeScript (thao tác ghi bằng SQL thô) | CHECK sinh từ `inList()` | Đạt |
| R3 | Trigger vẫn nằm trong migration viết tay, đánh số chung với drizzle-kit | `drizzle-kit generate --custom` | Đạt |
| R4 | Cố vấn và thợ không thấy giá vốn ở bất kỳ phản hồi nào, kể cả nhật ký | quét sâu mọi khóa của phản hồi (API test 3) | Đạt |
| R5 | Đầu ra theo danh sách cho phép: query lỡ lấy thừa cột giá vốn thì view vẫn bỏ đi | thử đột biến (bảng dưới) | Đạt |
| R6 | Mọi truy cập lệnh bị giới hạn trong chi nhánh của người gọi; `branch_id` không đổi được | API test 5, trigger `*_branch_immutable` | Đạt |
| R7 | Production chỉ tin JWT của Cloudflare Access đã kiểm chữ ký; header email chỉ dùng khi `DEV_AUTH=1` | API test 9, 2 test JWT | Đạt |
| R8 | Webhook ngân hàng kiểm HMAC, gửi lại không ghi hai lần, không khớp thì lưu chờ ghép tay | API test 2, 8 | Đạt |

Tổng: **38/38 test đạt** (27 thao tác, 9 API, 2 JWT).

**Thử đột biến** (cố ý làm hỏng code để chứng minh test bắt được):

| Đột biến | Kết quả |
| --- | --- |
| `seesCost` luôn trả `true` (ai cũng thấy giá vốn) | API test 3 hỏng: bắt được |
| Query lấy thừa `parts_cost_vnd` và view đổi sang `looseObject` | API test 3 hỏng: bắt được |
| Query lấy thừa `parts_cost_vnd`, view giữ `z.object` | Test vẫn đạt: allowlist tự bỏ cột thừa, đúng thiết kế |

**API**

| Phương thức | Đường dẫn | Vai được phép |
| --- | --- | --- |
| POST | `/api/work-orders` | owner, manager, advisor |
| GET | `/api/work-orders/:id` | mọi vai; chỉ owner, manager, accountant, investor, storekeeper thấy `cost` và `stock_moves` |
| POST | `/api/work-orders/:id/lines` | owner, manager, advisor |
| POST | `/api/work-orders/:id/transition` | owner, manager, advisor; technician chỉ sang `in_progress`, `qc` |
| POST | `/api/work-orders/:id/issue` | owner, manager, storekeeper |
| POST | `/api/work-orders/:id/cancel` | owner, manager |
| POST | `/api/work-orders/:id/reopen` | owner, manager |
| POST | `/api/work-orders/:id/payment-intents` | owner, manager, advisor, cashier |
| GET | `/api/work-orders/:id/audit` | dòng có giá vốn bị lọc trong SQL với vai không thấy giá vốn |
| GET | `/api/dashboard/daily?from&to` | owner, manager, accountant, investor |
| GET | `/api/dashboard/monthly?from=YYYY-MM&to=YYYY-MM` *(mới)* | owner, manager, accountant, investor. `from` ≤ `to`, tối đa 24 tháng (tính cả hai đầu); sai định dạng hoặc quá 24 tháng trả 400 |
| POST | `/webhooks/bank/:provider` | không qua Access; header `x-signature` = HMAC-SHA256 hex của body |

**Trường mới trong phản hồi** (commit `e5d1a61`)

| API | Trường mới | Ý nghĩa |
| --- | --- | --- |
| `GET /api/work-orders/:id` | `completed_at` | ms UTC lần đầu lệnh sang `delivered`; `null` nếu chưa giao |
| | `completed_biz_date` | Ngày nghiệp vụ giờ VN của `completed_at` (`YYYY-MM-DD`); dashboard gom doanh thu theo ngày này |
| | `events[]` | Lịch sử từ `work_order_events`, cũ trước: `at`, `kind` (`status`, `lock`, `unlock`, `reopen`), `from_value`, `to_value`, `by_id`, `by_name`, `reason`. Không có tiền hay giá vốn, nên mọi vai đều thấy |
| `GET /api/work-orders/:id/audit` | `actor_name` | Tên người thao tác (`users.full_name`); `system` hiện "Hệ thống"; mã không có trong `users` trả lại chính mã |
| `GET /api/dashboard/daily` | `orders_completed` | Số lệnh hoàn thành trong ngày |
| | `discount_completed_vnd` | Giảm giá của các lệnh đó |
| | `cogs_provisional_vnd` | Phần giá vốn còn tạm tính (`cost_status = 'provisional'`), đã nằm trong `cogs_completed_vnd` |
| `GET /api/dashboard/monthly` | mỗi tháng một dòng: `month`, `orders_completed`, `rev_labor_completed_vnd`, `rev_parts_completed_vnd`, `discount_completed_vnd`, `net_revenue_vnd`, `cogs_completed_vnd`, `cogs_provisional_vnd`, `gross_profit_vnd`, `margin_bp`, `collected_vnd` | `net_revenue_vnd` = công + phụ tùng − giảm giá; `gross_profit_vnd` = `net_revenue_vnd` − `cogs_completed_vnd` (gồm cả phần tạm tính); `margin_bp` là tỷ suất lãi gộp theo phần vạn, `null` khi doanh thu thuần ≤ 0. Tháng không có dòng nào trong `daily_branch_stats` không được trả về; giao diện tự điền 0 |

Thao tác ghi bắt buộc header `Idempotency-Key`. Lỗi nghiệp vụ trả 409 với mã (`ORDER_LOCKED`, `INSUFFICIENT_STOCK`…), đầu vào sai trả 400, thiếu quyền 403, khác chi nhánh 404.

**Biến môi trường**

| Biến | Dùng cho |
| --- | --- |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | Kiểm JWT Cloudflare Access (production) |
| `DEV_AUTH=1` | Chỉ local: tin header `x-dev-user-email`. Không bao giờ đặt trên môi trường deploy |
| `BANK_WEBHOOK_SECRET` | Kiểm chữ ký webhook (secret) |
| `WEBHOOK_BRANCH_ID` | Chi nhánh nhận giao dịch không ghép được |

**Quy trình đổi schema**

1. Sửa `src/db/schema.ts`.
2. `npx drizzle-kit generate --name=<tên>`: sinh migration bảng.
3. Trigger mới: `npx drizzle-kit generate --custom --name=<tên>` rồi viết SQL vào file vừa tạo.
4. `npm test`.

Đã đổi so với vòng 1: bảng không còn `STRICT` (drizzle-kit không sinh được), bù bằng CHECK cho các cột enum quan trọng; biển số chuyển sang bảng `vehicle_plates`.

## Phát hiện

1. **Không trộn `?` với `?N` trong cùng một câu.** SQLite đánh số `?` tiếp theo số lớn nhất đã gặp, nên tham số lệch và D1 báo "Wrong number of parameter bindings". Quy tắc: mỗi câu chỉ dùng một kiểu. Mã guard được nhúng thẳng vào SQL (đã kiểm định dạng `^[A-Z_]+$`) để tham số của điều kiện luôn bắt đầu từ `?1`.
2. **Tài liệu thiết kế mục 2.3 có lỗi đảo dấu giá vốn khi hoàn kho.** Bộ kiểm bất biến không phát hiện được, vì số dư và sổ kho cùng sai một kiểu. Đã sửa, và thêm ràng buộc `CHECK (total_cost_vnd >= 0)` trên `stock_moves`; tiêm lại lỗi cũ thì ràng buộc này bắt được ngay (`NEGATIVE_MOVE_COST`). Bài học: bộ kiểm bất biến chỉ chứng minh các số nhất quán với nhau, không chứng minh chúng đúng; cần thêm ràng buộc dấu và test giá trị cụ thể.
3. Batch xuất kho cố định 14 câu, dù phiếu có bao nhiêu dòng (dòng truyền bằng một tham số JSON).
4. Bộ đếm số chứng từ phụ chỉ tăng khi chứng từ thật sự được tạo (`nextSeqIf`), để phiếu nhập hoàn kho và phiếu chi không bị nhảy số khi lệnh hủy không có hàng hay tiền.
5. `sqlite_version()` bị D1 chặn ("not authorized"). Không dùng nó trong chẩn đoán.
6. `UNIQUE(provider, provider_txn_id)` của giao dịch ngân hàng là toàn cục, không theo chi nhánh. Đó là chủ ý: một giao dịch ngân hàng chỉ được ghi một lần.

## Chạy local

```bash
npm ci
npm test            # xóa D1 local, áp migration, chạy 38 test
npm run dev         # Worker thăm dò ở http://localhost:8787 (chép .dev.vars.example thành .dev.vars)
```

Mỗi test tạo một chi nhánh riêng; vì mọi bảng có `branch_id`, các test không lẫn dữ liệu và chạy song song được.

## Chạy trên D1 thật (gói Free) để đo tiêu chí 9

Dùng một database riêng cho thử nghiệm, không dùng database sẽ chứa dữ liệu thật.

```bash
npx wrangler login
npx wrangler d1 create gara24          # chép database_id vào wrangler.jsonc
npx wrangler d1 migrations apply gara24 --remote
npx wrangler secret put PROBE_TOKEN    # nhập một chuỗi ngẫu nhiên dài
npx wrangler deploy

curl -X POST -H "x-probe-token: $TOKEN" https://gara24-d1-spike.<subdomain>.workers.dev/probe/scenario
curl -X POST -H "x-probe-token: $TOKEN" "https://gara24-d1-spike.<subdomain>.workers.dev/probe/limits?n=60"
```

Đọc kết quả `/probe/limits`:

- `separateQueries.failedAfter` khoảng 50: giới hạn 50 truy vấn mỗi lần gọi đang áp dụng.
- `batchOfN.ok = true` với n = 60: một batch được tính là một truy vấn, thiết kế giữ nguyên.
- `batchOfN.ok = false`: mỗi câu trong batch bị tính riêng. Khi đó một request chỉ chạy được khoảng 3 batch xuất kho trên gói Free; lên Workers Paid (1000) là hết vấn đề, nhưng cần biết trước khi demo.

Xong thì xóa: `npx wrangler delete` và `npx wrangler d1 delete gara24`.

## Phiên bản và CVE (kiểm ngày 04/11/2026)

| Gói | Phiên bản | Ghi chú |
| --- | --- | --- |
| wrangler | 4.151.3 | Bản mới nhất đã phát hành từ 14 ngày trở lên |
| undici (qua miniflare) | 7.30.1 (ép bằng `overrides`) | wrangler 4.151.3 kéo undici 7.30.0, dính 8 advisory (1 high: GHSA-4qv8-2p9j-2685 và các mã khác trong `npm audit`). Bản sửa trong wrangler là 4.153.0, mới phát hành 9 ngày, nên chọn ép undici 7.30.1 (20 ngày) thay vì nâng wrangler |
| hono | 4.13.13 | |
| drizzle-orm | 0.45.4 | |
| drizzle-kit | 0.31.11 | Kéo `@esbuild-kit/core-utils` dùng esbuild 0.18.20, dính GHSA-67mh-4wv8-2f99 (moderate, lỗi CORS của dev server esbuild). Ép esbuild 0.25.12 cho riêng gói đó bằng `overrides` |
| zod | 4.6.7 | |

`npm audit`: 0 lỗ hổng.

## Chưa làm trong bản thử

Bình quân cuối kỳ (`cost_runs`) và FIFO; chuỗi VietQR thật trong `qr_payload`; phát hành hóa đơn điện tử; xuất file MISA; Durable Object cho bảng điều phối; giao diện PWA.

## Cấu trúc

```
src/db/schema.ts                Drizzle schema, 48 bảng nhóm A–G
migrations/0000_core.sql        do drizzle-kit sinh
migrations/0001_guards.sql      viết tay: trigger cho từng mã guard
migrations/0002_invariants.sql  viết tay: khóa lệnh, khóa kỳ, chỉ ghi thêm, không xóa, branch bất biến
src/api/auth.ts                 kiểm JWT Access, vai, bảng quyền, COST_ROLES
src/api/views.ts                Zod: đầu vào và view đầu ra theo vai
src/api/routes.ts               route Hono, webhook ngân hàng
src/lib.ts                      runBatch, guard, ánh xạ lỗi, uuidv7, biz_date giờ VN
src/ops.ts                      các thao tác, mỗi thao tác một db.batch()
src/invariants.ts               bộ kiểm bất biến (dùng cho test và job đêm)
src/index.ts                    Worker thăm dò: /probe/scenario, /probe/limits
test/ops.test.ts                27 test thao tác
test/api.test.ts                11 test API và JWT
```
