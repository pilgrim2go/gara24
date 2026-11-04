# gara24

Phần mềm quản lý gara sửa ô tô (dưới 10 người, 1 cơ sở): lệnh sửa chữa, kho phụ tùng, thu tiền, báo cáo quản trị. MISA giữ sổ sách; chứng từ đi một chiều từ app sang MISA. Stack Cloudflare: Workers + Hono + Zod, D1 + Drizzle.

Trạng thái: demo giai đoạn 1 (schema, 4 thao tác nguyên tử, API theo vai). Chưa có giao diện.

```bash
make install && make test     # 38 test trên D1 local
make                          # danh sách lệnh vận hành
```

| Tài liệu | Cho ai | Ở đâu |
| --- | --- | --- |
| Vận hành: cài đặt, deploy, migration, sao lưu, sự cố | Người vận hành IT | [docs/ops](docs/ops/README.md) |
| Hướng dẫn sử dụng theo vai | Chủ gara, cố vấn, thợ, thủ kho, kế toán | [docs/user](docs/user/README.md) |
| Thiết kế: yêu cầu, mô hình dữ liệu, kết quả thử nghiệm | Người phát triển | [docs/design](docs/design/README.md) |
| Quy ước cho Claude và quy trình patch | Người phát triển, Claude | [AGENTS.md](AGENTS.md) |
