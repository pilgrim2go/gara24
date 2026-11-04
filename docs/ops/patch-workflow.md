# Nhận và áp patch từ Claude

## Áp patch

```bash
git pull
make patch-apply P=0003-ten-patch.patch   # kiểm cây sạch, commit gốc, làn, rồi git am --3way và chạy test
git push
```

`make patch-apply` từ chối khi: cây làm việc chưa sạch; commit gốc của patch (`base-commit:`) không có trong nhánh hiện tại; patch chạm hơn một làn. Lỗi khi `git am`: `git am --abort` rồi mở chat mới với commit hiện tại.

## Vì sao không xung đột

- Mỗi chat chỉ sửa file trong một làn ([.lanes](../../.lanes)). Hai patch khác làn chạm các file khác nhau nên áp theo thứ tự nào cũng được.
- Changelog là nhiều file nhỏ trong `changes/`, mỗi patch thêm một file, không ai sửa chung một file.
- Migration và lockfile chỉ do làn core sửa, và chỉ một chat core tại một thời điểm.
- Mục lục (`README.md`, `docs/README.md`) thuộc làn meta, ít khi sửa.

## Mẫu prompt cho chat mới

Đặt phần cố định vào hướng dẫn của Claude Project; mỗi chat chỉ cần phần dưới.

```text
Repo: https://github.com/<user>/gara24 (nhánh main, commit gốc <hash>)
Làn: <core | ops | user | design | meta>
Việc: <mô tả việc cần làm>
Ràng buộc thêm: <nếu có>
Làm theo AGENTS.md. Trả về một file .patch.
```
