#!/usr/bin/env bash
# Kiểm Worker đã deploy có Cloudflare Access chặn phía trước, và cửa demo đã đóng.
#   scripts/cf-check.sh https://<worker>.<subdomain>.workers.dev
# Có ACCESS_CLIENT_ID/ACCESS_CLIENT_SECRET (service token) thì kiểm thêm phần sau Access.
set -uo pipefail
url="${1:?cách dùng: cf-check.sh <URL>}"; url="${url%/}"
fail=0
ok()  { printf '  OK    %s\n' "$1"; }
bad() { printf '  LỖI   %s\n' "$1"; fail=1; }

# 1-2. Không có danh tính: Access phải chặn trước khi tới Worker (302 sang trang đăng nhập *.cloudflareaccess.com).
for path in "GET /api/me" "POST /probe/limits?n=1" "GET /"; do
  m=${path%% *}; p=${path#* }
  res=$(curl -sS -o /dev/null -X "$m" -w '%{http_code} %{redirect_url}' "$url$p")
  if [[ "$res" == 302\ *cloudflareaccess.com* ]]; then ok "$m $p không danh tính → Access chuyển sang đăng nhập"
  else bad "$m $p không danh tính → '$res' (mong 302 sang *.cloudflareaccess.com). Access chưa bật cho workers.dev?"; fi
done

# 3. Qua Access bằng service token: Worker sống, route demo đã tắt.
if [[ -n "${ACCESS_CLIENT_ID:-}" && -n "${ACCESS_CLIENT_SECRET:-}" ]]; then
  H=(-H "CF-Access-Client-Id: $ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $ACCESS_CLIENT_SECRET")
  # /health nằm ngoài run_worker_first nên trả index.html; dùng /probe/* (luôn vào Worker) không kèm PROBE_TOKEN.
  c=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${H[@]}" "$url/probe/limits?n=1")
  [[ "$c" == 401 ]] && ok "service token qua Access, Worker trả 401 khi thiếu PROBE_TOKEN" \
    || bad "service token → /probe/limits = $c (mong 401 từ Worker). Thiếu chính sách Service Auth cho token này?"
  c=$(curl -sS -o /dev/null -w '%{http_code}' "${H[@]}" "$url/dev/users")
  [[ "$c" == 404 ]] && ok "/dev/users = 404 (route demo đã tắt)" \
    || bad "/dev/users = $c (mong 404). Kiểm secret ACCESS_TEAM_DOMAIN đã đặt chưa: make cf-access"
  c=$(curl -sS -o /dev/null -w '%{http_code}' "${H[@]}" "$url/api/me")
  [[ "$c" == 401 ]] && ok "/api/me bằng service token = 401 (token không có email, đúng thiết kế)" \
    || bad "/api/me bằng service token = $c (mong 401). Kiểm ACCESS_TEAM_DOMAIN và ACCESS_AUD."
else
  echo "  BỎ QUA phần sau Access: chưa có ACCESS_CLIENT_ID/ACCESS_CLIENT_SECRET (make cf-env ...)"
fi
exit $fail
