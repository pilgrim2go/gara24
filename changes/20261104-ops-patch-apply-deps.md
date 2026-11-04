---
lane: ops
docs-impact: none
---

- `make patch-apply` kiểm đã cài phụ thuộc (wrangler) TRƯỚC khi `git am`, để không áp patch xong rồi mới hỏng ở bước test.
