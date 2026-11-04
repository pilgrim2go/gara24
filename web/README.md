# web: giao diện Gara24

React 19 + Vite 8, TypeScript strict. Gói npm riêng, không dùng chung `package.json` với Worker.

```bash
npm ci
npm run dev      # http://localhost:5173, chuyển tiếp /api, /dev, /webhooks sang Worker ở :8787 (make dev)
npm run build    # kiểm kiểu rồi build ra web/dist; Worker phục vụ thư mục này
```

| Màn hình | Đường dẫn | Ai dùng |
| --- | --- | --- |
| Chọn người dùng demo | (khi chưa đăng nhập) | chỉ local, cần `DEV_AUTH=1` |
| Điều phối xưởng (G1-15) | `#/board` | mọi vai |
| Chi tiết lệnh | `#/orders/<id>` | mọi vai; khung lãi chỉ vai thấy giá vốn |
| Tiếp nhận xe | `#/new` | chủ gara, quản lý, cố vấn |
| Báo cáo ngày | `#/reports` | chủ gara, quản lý, kế toán, nhà đầu tư |

Quy ước:
- Mọi chuỗi hiển thị bằng tiếng Việt; thông báo lỗi ánh xạ từ mã lỗi API trong `src/api.ts`.
- Kiểu dữ liệu trong `src/api.ts` phải khớp `src/api/views.ts` của Worker; đổi API thì sửa cả hai (hai làn, hai patch).
- Ẩn giá vốn là việc của API. Giao diện chỉ không vẽ khung lãi khi phản hồi không có trường `cost`.
- Đổi người dùng luôn tải lại cả trang để không còn dữ liệu của vai trước trong bộ nhớ.
- Service worker chỉ lưu vỏ ứng dụng, không lưu phản hồi `/api`.

Chưa có: ảnh VietQR (cần tài khoản ngân hàng của gara), offline bằng Dexie (để G3-01), tên người trong nhật ký (hiện mã người dùng), font tự host (đang tải từ Google Fonts).
