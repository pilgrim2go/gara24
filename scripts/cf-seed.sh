#!/usr/bin/env bash
# Nạp dữ liệu demo (chi nhánh demo-q7, 9 người dùng mẫu, xe, phụ tùng, lệnh) vào D1 THẬT.
# Cách làm: chạy Worker trên máy bằng `wrangler dev` với binding D1 remote và DEV_AUTH=1, gọi /dev/seed, rồi tắt.
# DEV_AUTH chỉ tồn tại trong tiến trình local này; Worker đã deploy không có nó nên /dev/* vẫn 404.
# Code chạy trên máy nên không vướng trần truy vấn mỗi lần gọi của gói Free (seed cần nhiều hơn 50 truy vấn).
#   scripts/cf-seed.sh <db-id> [db-name]
#   CF_SEED_LOCAL=1 scripts/cf-seed.sh 11111111-2222-3333-4444-555555555555   # tự kiểm trên D1 local, không cần tài khoản
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
id="${1:?cách dùng: cf-seed.sh <db-id> [db-name]}"
name="${2:-gara24}"
port="${SEED_PORT:-8799}"
cfg=.wrangler/deploy/seed.json

if [[ "${CF_SEED_LOCAL:-}" == 1 ]]; then
  node scripts/cf-config.mjs --db-id "$id" --db-name "$name" --out "$cfg" --local-binding
  npx wrangler d1 migrations apply "$name" --local -c "$cfg" >/dev/null
else
  node scripts/cf-config.mjs --db-id "$id" --db-name "$name" --out "$cfg" --remote-binding
fi

log=$(mktemp)
# setsid: wrangler sinh tiến trình con (workerd); tắt cả nhóm để không bỏ sót.
setsid npx wrangler dev -c "$cfg" --var DEV_AUTH:1 --ip 127.0.0.1 --port "$port" \
  --show-interactive-dev-session=false >"$log" 2>&1 &
pid=$!
cleanup() { kill -TERM -- "-$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; rm -f "$log"; }
trap cleanup EXIT

for _ in $(seq 1 120); do
  curl -fsS "http://127.0.0.1:$port/dev/users" >/dev/null 2>&1 && break
  kill -0 "$pid" 2>/dev/null || { tail -40 "$log"; echo "wrangler dev dừng sớm (xem log ở trên)"; exit 1; }
  sleep 1
done
curl -fsS "http://127.0.0.1:$port/dev/users" >/dev/null || { tail -40 "$log"; echo "Worker local không lên sau 120 giây"; exit 1; }

out=$(curl -sS -X POST "http://127.0.0.1:$port/dev/seed")
echo "$out"
if ! grep -q '"branch_id"' <<<"$out"; then tail -40 "$log"; echo "Seed lỗi"; exit 1; fi
grep -q '"seeded":false' <<<"$out" && echo "Đã có dữ liệu demo từ trước, không nạp lại." || true
