# Migration

Migration do làn core tạo. Chỉ một chat core chạy tại một thời điểm, vì drizzle-kit đánh số migration và journal tuần tự; hai chat cùng tạo migration sẽ xung đột.

1. Sửa `src/db/schema.ts`.
2. `npx drizzle-kit generate --name=<tên>`: migration bảng.
3. Trigger, guard: `npx drizzle-kit generate --custom --name=<tên>` rồi viết SQL vào file vừa tạo.
4. `make test`.
5. Môi trường thật: `make migrate-remote CONFIRM=yes` (tự `d1-backup` trước).

Không sửa migration đã áp lên môi trường thật; muốn đổi thì tạo migration mới.
