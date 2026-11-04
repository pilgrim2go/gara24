# Makefile vận hành gara24. Chạy `make` để xem danh sách lệnh.
# Lệnh chạm môi trường thật (remote) đòi CONFIRM=yes.
SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help
DB ?= gara24
STAMP := $(shell date -u +%Y%m%dT%H%M%SZ)

.PHONY: help install test check audit dev db-reset migrate-local migrate-remote deploy \
        d1-backup probe-scenario probe-limits bundle patch-apply lanes new-change

help: ## Liệt kê lệnh
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n",$$1,$$2}'

# ---------------------------------------------------------------- phát triển
install: ## Cài đúng phiên bản trong package-lock.json
	npm ci

test: ## Xóa D1 local, áp migration, chạy toàn bộ test
	npm test

audit: ## Kiểm lỗ hổng phụ thuộc (CVE)
	npm audit

check: audit test lanes ## Kiểm trước khi gửi/áp patch: CVE + test + làn của commit cuối

dev: ## Chạy Worker local (cần .dev.vars, chép từ .dev.vars.example)
	@test -f .dev.vars || { echo "Thiếu .dev.vars: cp .dev.vars.example .dev.vars"; exit 1; }
	npx wrangler dev

db-reset: ## Xóa D1 local rồi áp lại migration
	rm -rf .wrangler/state && npx wrangler d1 migrations apply $(DB) --local

migrate-local: ## Áp migration mới vào D1 local
	npx wrangler d1 migrations apply $(DB) --local

# ---------------------------------------------------------------- môi trường thật
guard:
	@[[ "$(CONFIRM)" == "yes" ]] || { echo "Lệnh này chạm môi trường thật. Chạy lại với CONFIRM=yes"; exit 1; }

migrate-remote: guard d1-backup ## Sao lưu rồi áp migration lên D1 thật (CONFIRM=yes)
	npx wrangler d1 migrations apply $(DB) --remote

deploy: guard check ## Kiểm rồi deploy Worker (CONFIRM=yes)
	npx wrangler deploy

d1-backup: ## Xuất toàn bộ D1 thật ra backups/<thời điểm>.sql
	mkdir -p backups
	npx wrangler d1 export $(DB) --remote --output backups/$(DB)-$(STAMP).sql
	@echo "Đã lưu backups/$(DB)-$(STAMP).sql. Chép ra nơi gara kiểm soát (G1-17)."

probe-scenario: ## Chạy kịch bản thăm dò trên Worker đã deploy (URL=, PROBE_TOKEN=)
	@[[ -n "$(URL)" && -n "$(PROBE_TOKEN)" ]] || { echo "Cần URL=https://... PROBE_TOKEN=..."; exit 1; }
	curl -sS -X POST -H "x-probe-token: $(PROBE_TOKEN)" "$(URL)/probe/scenario"; echo

probe-limits: ## Đo giới hạn truy vấn mỗi lần gọi (URL=, PROBE_TOKEN=, N=60)
	@[[ -n "$(URL)" && -n "$(PROBE_TOKEN)" ]] || { echo "Cần URL=https://... PROBE_TOKEN=..."; exit 1; }
	curl -sS -X POST -H "x-probe-token: $(PROBE_TOKEN)" "$(URL)/probe/limits?n=$${N:-60}"; echo

# ---------------------------------------------------------------- quy trình patch
bundle: ## Đóng gói cả repo thành một file để gửi kèm chat (khi không dùng GitHub)
	git bundle create gara24-$(STAMP).bundle --all

patch-apply: ## Áp patch từ Claude: make patch-apply P=0003-xyz.patch
	@[[ -n "$(P)" ]] || { echo "Cần P=<file.patch>"; exit 1; }
	@git diff --quiet && git diff --cached --quiet || { echo "Cây làm việc chưa sạch"; exit 1; }
	@base=$$(sed -n 's/^base-commit: //p' "$(P)" | head -1); \
	 if [[ -n "$$base" ]] && ! git merge-base --is-ancestor "$$base" HEAD; then \
	   echo "Patch dựa trên $$base, commit này không có trong nhánh hiện tại. git pull trước."; exit 1; fi
	scripts/check-lanes.sh "$(P)"
	git am --3way "$(P)"
	npm test

lanes: ## Kiểm commit cuối chỉ chạm một làn
	scripts/check-lanes.sh HEAD~1..HEAD

new-change: ## Tạo mẩu changelog: make new-change LANE=ops SLUG=backup-r2
	@[[ -n "$(LANE)" && -n "$(SLUG)" ]] || { echo "Cần LANE= và SLUG="; exit 1; }
	@f=changes/$$(date +%Y%m%d)-$(LANE)-$(SLUG).md; \
	 printf -- '---\nlane: %s\ndocs-impact: none\n---\n\n- \n' "$(LANE)" > $$f; echo "Đã tạo $$f"
