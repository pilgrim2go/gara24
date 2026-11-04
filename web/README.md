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

## Font

Tự host, không gọi Google Fonts. Nhập trong `src/main.tsx` từ hai gói npm cố định phiên bản; Vite đóng tệp woff2/woff vào `dist/assets/` kèm hash, nên service worker lưu font như mọi tài nguyên tĩnh khác.

| Font | Gói | Độ đậm | Dùng cho |
| --- | --- | --- | --- |
| Be Vietnam Pro | `@fontsource/be-vietnam-pro` 5.3.0 | 400, 500, 600, 700 | chữ thường (`--font`) |
| Barlow Condensed | `@fontsource/barlow-condensed` 5.3.0 | 500, 600 | biển số, số tiền, tiêu đề hẹp (`--narrow`) |

- Giấy phép: SIL Open Font License 1.1, cho phép nhúng vào web và phân phối lại kèm thông báo bản quyền và văn bản giấy phép. Văn bản nằm ở `public/licenses/fonts-OFL.txt` (phục vụ tại `/licenses/fonts-OFL.txt`), vì tệp woff2 đã bị bỏ trường mô tả giấy phép. Không font nào có Reserved Font Name.
- Mỗi độ đậm chia 3 tập ký tự (vietnamese, latin-ext, latin) bằng `unicode-range`. Trang tiếng Việt chỉ tải tập vietnamese và latin: tối đa khoảng 190 KB cho cả 6 độ đậm, mỗi tệp 9–22 KB.
- Thêm độ đậm mới trong `styles.css` thì thêm dòng `import` tương ứng, nếu không trình duyệt sẽ tự làm đậm giả.
- Nâng phiên bản gói font: chọn bản đã phát hành từ 14 ngày trở lên, chạy `npm audit`, sửa số phiên bản trong `fonts-OFL.txt` và bảng trên.

Chưa có: ảnh VietQR (cần tài khoản ngân hàng của gara), offline bằng Dexie (để G3-01), tên người trong nhật ký (hiện mã người dùng).
