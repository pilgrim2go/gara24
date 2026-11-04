# Changelog dạng mẩu

Mỗi patch thêm đúng một file `YYYYMMDD-<làn>-<slug>.md` (tạo nhanh: `make new-change LANE=ops SLUG=xyz`). Không sửa file của patch khác, nên các patch song song không xung đột ở đây.

```markdown
---
lane: core
docs-impact: none | ops | user
---

- Một đến ba dòng mô tả thay đổi.
```

Khi phát hành một phiên bản, làn meta gom các mẩu thành ghi chú phát hành.
