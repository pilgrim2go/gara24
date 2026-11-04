#!/usr/bin/env node
// Sinh cấu hình wrangler cho môi trường thật từ wrangler.jsonc (làn core) mà KHÔNG sửa file đó.
// Lý do: mỗi gara một D1 riêng, nên database_id không nằm trong repo công khai; sửa wrangler.jsonc tại chỗ
// làm bẩn cây làm việc và chặn `make patch-apply`.
//
//   node scripts/cf-config.mjs --db-id <uuid> [--db-name gara24] [--out .wrangler/deploy/wrangler.json]
//                              [--remote-binding] [--local-binding]
//
// --remote-binding: D1 trỏ vào database thật ngay cả khi `wrangler dev` (dùng cho `make cf-seed`).
// --local-binding : chỉ để tự kiểm script trên máy, không cần tài khoản Cloudflare.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes(name);
const die = (msg) => { console.error(`cf-config: ${msg}`); process.exit(1); };

const root = process.cwd();
const src = resolve(root, opt('--src', 'wrangler.jsonc'));
const out = resolve(root, opt('--out', '.wrangler/deploy/wrangler.json'));
const dbId = opt('--db-id', '');
const dbName = opt('--db-name', 'gara24');

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbId)) die(`--db-id không phải UUID: "${dbId}"`);
if (/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(dbId)) die('--db-id là id giữ chỗ, chưa phải database thật');

// Bỏ chú thích // và /* */ nằm ngoài chuỗi, rồi bỏ dấu phẩy thừa trước } hoặc ].
function stripJsonc(text) {
  let s = '', i = 0, inStr = false;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (inStr) {
      s += c;
      if (c === '\\') { s += n ?? ''; i += 2; continue; }
      if (c === '"') inStr = false;
      i++;
    } else if (c === '"') { inStr = true; s += c; i++; }
    else if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; }
    else if (c === '/' && n === '*') { i = text.indexOf('*/', i + 2); if (i < 0) die('chú thích /* chưa đóng'); i += 2; }
    else { s += c; i++; }
  }
  return s.replace(/,(\s*[}\]])/g, '$1');
}

let cfg;
try { cfg = JSON.parse(stripJsonc(readFileSync(src, 'utf8'))); }
catch (e) { die(`không đọc được ${src}: ${e.message}`); }

const db = (cfg.d1_databases ?? []).find((d) => d.binding === 'DB');
if (!db) die('wrangler.jsonc không có binding D1 tên DB');
if (cfg.vars && 'DEV_AUTH' in cfg.vars) die('wrangler.jsonc có DEV_AUTH trong vars; không được deploy biến này');
for (const env of Object.values(cfg.env ?? {})) if (env?.vars && 'DEV_AUTH' in env.vars) die('có DEV_AUTH trong env.*.vars');

// Đường dẫn trong cấu hình wrangler tính từ thư mục chứa file cấu hình, nên viết lại cho đúng chỗ mới.
const outDir = dirname(out);
const rel = (p) => { const r = relative(outDir, resolve(dirname(src), p)); return r.startsWith('.') ? r : `./${r}`; };
for (const k of ['main', '$schema', 'tsconfig', 'base_dir']) if (typeof cfg[k] === 'string') cfg[k] = rel(cfg[k]);
if (cfg.assets?.directory) cfg.assets.directory = rel(cfg.assets.directory);
for (const d of cfg.d1_databases) d.migrations_dir = rel(d.migrations_dir ?? 'migrations');

db.database_id = dbId;
db.database_name = dbName;
if (flag('--remote-binding')) db.remote = true;
if (flag('--local-binding')) delete db.remote;

// workers.dev bật (Access một chạm che địa chỉ này); tắt Preview URLs để không có cửa thứ hai thiếu Access.
cfg.workers_dev = true;
cfg.preview_urls = false;

mkdirSync(outDir, { recursive: true });
writeFileSync(out, JSON.stringify(cfg, null, 2) + '\n');
console.log(`Đã ghi ${relative(root, out)} (D1 ${dbName} = ${dbId}${db.remote ? ', binding remote' : ''})`);
