#!/usr/bin/env bash
# Kiểm một patch (hoặc một dải commit) chỉ chạm vào MỘT làn, cộng thư mục changes/.
#   scripts/check-lanes.sh 0003-xyz.patch
#   scripts/check-lanes.sh base-0.2..HEAD
#   scripts/check-lanes.sh --allow core,ops 0004-xyz.patch   # patch liên làn đã được đồng ý
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

allow=""
if [[ "${1:-}" == "--allow" ]]; then allow="$2"; shift 2; fi
target="${1:?cách dùng: check-lanes.sh [--allow a,b] <patch-file|rev-range>}"

if [[ -f "$target" ]]; then
  files=$(git apply --numstat "$target" | awk '{print $3}')
else
  files=$(git diff --name-only "$target")
fi

lane_of() {
  local f="$1" lane prefix
  while read -r lane prefix; do
    [[ -z "$lane" || "$lane" == \#* ]] && continue
    if [[ "$f" == "$prefix"* ]]; then echo "$lane"; return; fi
  done < .lanes
  echo "UNMAPPED"
}

declare -A seen=()
bad=0
while read -r f; do
  [[ -z "$f" ]] && continue
  l=$(lane_of "$f")
  printf '  %-8s %s\n' "$l" "$f"
  [[ "$l" == "UNMAPPED" ]] && bad=1
  [[ "$l" != "changes" ]] && seen[$l]=1
done <<< "$files"

lanes=("${!seen[@]}")
if (( bad )); then echo "LỖI: có file chưa thuộc làn nào, thêm vào .lanes (làn meta)"; exit 1; fi
if (( ${#lanes[@]} > 1 )); then
  IFS=, read -ra ok <<< "$allow"
  for l in "${lanes[@]}"; do
    [[ " ${ok[*]} " == *" $l "* ]] || { echo "LỖI: patch chạm ${#lanes[@]} làn (${lanes[*]}). Tách patch, hoặc dùng --allow nếu đã đồng ý."; exit 1; }
  done
fi
echo "OK: làn ${lanes[*]:-changes}"
