---
lane: web
docs-impact: user
---

- Màn lệnh có nút **Thu tiền mặt** (quyền `pay.cash`: chủ, quản lý, thu ngân), hiện khi lệnh chưa hủy và còn phải thu. Hộp thoại: số thu (mặc định = còn phải thu, cho thu một phần, chặn vượt), khách đưa, nút chọn nhanh "Đưa đúng số" và làm tròn lên 50k/100k/500k, tiền thối tính trực tiếp (báo đỏ khi khách đưa thiếu). Gửi `POST /api/work-orders/:id/payments/cash`; ghi chú phiếu tự thêm "Khách đưa X, thối Y" để đối chiếu két. Thành công hiện số phiếu PT và tiền thối.
- Màn mới **Nhập kho** (`#/receive`, quyền `stock.receive`: chủ, quản lý, thủ kho): chọn kho, số hóa đơn nhà cung cấp (khuyến nghị, không bắt buộc), nhiều dòng (tìm phụ tùng/vật tư, bỏ dịch vụ; mỗi mặt hàng một dòng; tối đa 100), số lượng 3 chữ số thập phân, đơn giá nhập, thành tiền làm tròn giống máy chủ, tổng phiếu. Cảnh báo dòng giá 0 đ. Thành công hiện số phiếu NK và các dòng.
- Chống ghi trùng: `api.post` nhận idempotency key; hook `useSubmitOnce` giữ nguyên khóa khi chưa rõ kết quả (mất mạng hoặc 5xx) và khóa ô nhập, nút đổi thành "Thử lại"; bị từ chối hẳn (4xx/409) thì đổi khóa để sửa rồi gửi như lần mới. Đã thử trên Worker local: gửi lại cùng khóa trả 200 đúng phiếu cũ (PT, NK), tiền và tồn không cộng hai lần.
- Thông báo tiếng Việt cho `AMOUNT_EXCEEDS_DUE`, `ORDER_NOT_PAYABLE`, `ITEM_NOT_STOCKABLE`, `DUPLICATE_ITEM`, `EMPTY_LINES`, `warehouse_not_found`, `idempotency_key_required`. Nhật ký lệnh hiện "Thu tiền mặt" cho `cash_in`.
- Không thêm hay đổi gói npm; `npm audit` (web và gốc): 0 lỗ hổng.
- Yêu cầu làn core: (1) `GET /api/items` chưa lọc `i.branch_id`, nên tìm thấy mặt hàng chi nhánh khác (máy chủ vẫn chặn khi ghi); nên lọc và trả thêm `track_stock` để giao diện ẩn mặt hàng không quản lý tồn. (2) Phiếu PT chưa lưu số khách đưa/tiền thối thành trường riêng; đang ghi vào `note`. (3) Chưa có API danh sách phiếu nhập và in phiếu thu.
- docs-impact user: thu-ngan.md (thu tiền mặt, tiền thối, số PT, khi nào bấm "Thử lại"), thu-kho.md (nhập kho nhiều dòng, số hóa đơn nhà cung cấp).
