---
lane: core
docs-impact: ops, user
---

- API cho giao diện: `/api/me`, `GET /api/work-orders` (bảng điều phối), tìm và thêm xe, danh mục phụ tùng (số tồn, không có giá trị tồn), kho, báo chờ / hết chờ (G1-01).
- Route demo `/dev/seed`, `/dev/users`, `/dev/simulate-bank`: chỉ bật khi `DEV_AUTH=1` và chưa cấu hình Access.
- Migration 0003 thêm mã guard cho khoảng chờ. Worker phục vụ `web/dist` (Workers static assets), nên `wrangler dev`/`deploy` cần build giao diện trước.
- 46 test (thêm 8 test API phục vụ giao diện).
