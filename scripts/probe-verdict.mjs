#!/usr/bin/env node
// Đọc JSON của /probe/limits từ stdin, in kết luận tiếng Việt. Thoát 2 nếu không đọc được kết quả.
//   curl ... /probe/limits?n=60 | node scripts/probe-verdict.mjs
import { readFileSync } from 'node:fs';

const raw = readFileSync(0, 'utf8').trim();
let r;
try { r = JSON.parse(raw); } catch {
  // curl không theo chuyển hướng: Access trả 302 thân rỗng, trình duyệt thì thấy trang đăng nhập.
  const accessPage = raw === '' || /cloudflareaccess|cf-access|<html/i.test(raw);
  console.log(accessPage
    ? 'KHÔNG ĐO ĐƯỢC: Access chặn request (trả trang đăng nhập). Kiểm ACCESS_CLIENT_ID/ACCESS_CLIENT_SECRET và chính sách Service Auth.'
    : `KHÔNG ĐO ĐƯỢC: phản hồi không phải JSON: ${raw.slice(0, 200)}`);
  process.exit(2);
}
if (r.error) {
  console.log(r.error === 'unauthorized'
    ? 'KHÔNG ĐO ĐƯỢC: Worker từ chối PROBE_TOKEN (chưa đặt secret hoặc token sai). Chạy: make cf-probe-on CONFIRM=yes'
    : `KHÔNG ĐO ĐƯỢC: ${r.error}`);
  process.exit(2);
}

const b = r.batchOfN ?? {}, s = r.separateQueries ?? {};
const n = b.n ?? s.n;
const lines = [`n = ${n}`];

if (b.ok) lines.push(`- batch ${n} câu: chạy được.`);
else lines.push(`- batch ${n} câu: LỖI (${b.error ?? '?'}). Mỗi câu trong batch có thể đang bị tính riêng.`);

if (s.ok) lines.push(`- ${n} truy vấn riêng lẻ: chạy đủ ${s.done}. Trần mỗi lần gọi Worker lớn hơn ${n + (b.ok ? 1 : 0)}.`);
else lines.push(`- truy vấn riêng lẻ: hỏng sau ${s.failedAfter} câu (${s.error ?? '?'}). Trần khoảng ${s.failedAfter + (b.ok ? 1 : 0)} nếu batch tính là 1.`);

let verdict;
if (!b.ok) verdict = 'Batch bị tính theo từng câu: gói Free không đủ cho thao tác ghi nhiều dòng. Lên Workers Paid trước khi demo cho gara.';
else if (s.ok) verdict = `Không chạm trần ở ${n}: giới hạn 50 không áp dụng cho D1 ở tài khoản này. Thiết kế giữ nguyên.`;
else if (s.failedAfter >= 45 && s.failedAfter <= 50 && n > 50) verdict = 'Trần 50 đang áp dụng và một batch tính là 1 truy vấn. Thiết kế giữ nguyên (mỗi thao tác ghi là một db.batch()).';
else verdict = 'Kết quả lệch dự kiến: ghi lại toàn bộ JSON vào docs/design (làn design) để xem lại.';
lines.push(`KẾT LUẬN: ${verdict}`);
console.log(lines.join('\n'));
