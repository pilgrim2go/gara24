# Makefile vận hành gara24. Chạy `make` để xem danh sách lệnh.
# Lệnh chạm môi trường thật (remote) đòi CONFIRM=yes.
SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help
DB ?= gara24
STAMP := $(shell date -u +%Y%m%dT%H%M%SZ)

# Môi trường thật: cấu hình sinh từ wrangler.jsonc kèm database_id thật (không commit, xem docs/ops/cloudflare-free.md).
# demo.env giữ URL, service token Access và PROBE_TOKEN trên máy vận hành; biến trên dòng lệnh vẫn thắng.
CF_DIR := .wrangler/deploy
CF_CFG := $(CF_DIR)/wrangler.json
CF_ENV := $(CF_DIR)/demo.env
-include $(CF_ENV)
WR := npx wrangler -c $(CF_CFG)
D1_LOCATION ?= apac
CF_DB_ID = $$(npx wrangler d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s).find(x=>x.name===process.argv[1]);if(!d)process.exit(1);console.log(d.uuid)})' $(DB))
ACCESS_HDR = $(if $(ACCESS_CLIENT_ID),-H "CF-Access-Client-Id: $(ACCESS_CLIENT_ID)" -H "CF-Access-Client-Secret: $(ACCESS_CLIENT_SECRET)")

.PHONY: help install test check audit dev db-reset migrate-local migrate-remote deploy \
        d1-backup probe-scenario probe-limits bundle patch-apply lanes new-change \
        web-install web-build web-dev seed-demo guard cf-ready cf-login cf-d1 cf-config cf-env cf-access \
        cf-seed cf-user cf-users cf-check cf-probe-on cf-probe cf-probe-off

help: ## Liệt kê lệnh
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n",$$1,$$2}'

# ---------------------------------------------------------------- phát triển
install: ## Cài đúng phiên bản trong package-lock.json (Worker và giao diện)
	npm ci
	npm --prefix web ci

test: ## Xóa D1 local, áp migration, chạy toàn bộ test
	npm test

audit: ## Kiểm lỗ hổng phụ thuộc (CVE), cả Worker và giao diện
	npm audit
	npm --prefix web audit

check: audit test lanes ## Kiểm trước khi gửi/áp patch: CVE + test + làn của commit cuối

dev: web-build ## Build giao diện rồi chạy Worker local ở :8787 (cần .dev.vars)
	@test -f .dev.vars || { echo "Thiếu .dev.vars: cp .dev.vars.example .dev.vars"; exit 1; }
	npx wrangler dev

web-install: ## Cài phụ thuộc của giao diện
	npm --prefix web ci

web-build: ## Kiểm kiểu và build giao diện ra web/dist (Worker phục vụ thư mục này)
	@test -d web/node_modules || npm --prefix web ci
	npm --prefix web run build

web-dev: ## Vite ở :5173, tự tải lại khi sửa giao diện; chạy song song với `make dev`
	npm --prefix web run dev

seed-demo: ## Nạp dữ liệu mẫu vào D1 local (Worker phải đang chạy, DEV_AUTH=1)
	curl -sS -X POST http://localhost:8787/dev/seed; echo

db-reset: ## Xóa D1 local rồi áp lại migration
	rm -rf .wrangler/state && npx wrangler d1 migrations apply $(DB) --local

migrate-local: ## Áp migration mới vào D1 local
	npx wrangler d1 migrations apply $(DB) --local

# ---------------------------------------------------------------- môi trường thật
guard:
	@[[ "$(CONFIRM)" == "yes" ]] || { echo "Lệnh này chạm môi trường thật. Chạy lại với CONFIRM=yes"; exit 1; }

cf-ready:
	@test -f $(CF_CFG) || { echo "Chưa có $(CF_CFG). Chạy: make cf-d1 CONFIRM=yes (lần đầu) hoặc make cf-config"; exit 1; }

migrate-remote: guard cf-ready d1-backup ## Sao lưu rồi áp migration lên D1 thật (CONFIRM=yes)
	$(WR) d1 migrations apply $(DB) --remote

deploy: guard cf-ready check web-build ## Kiểm, build giao diện rồi deploy (CONFIRM=yes)
	@grep -q '^DEV_AUTH' .dev.vars 2>/dev/null && echo "Lưu ý: DEV_AUTH chỉ nằm trong .dev.vars, không được deploy." || true
	$(WR) deploy

d1-backup: cf-ready ## Xuất toàn bộ D1 thật ra backups/<thời điểm>.sql
	mkdir -p backups
	$(WR) d1 export $(DB) --remote --output backups/$(DB)-$(STAMP).sql
	@echo "Đã lưu backups/$(DB)-$(STAMP).sql. Chép ra nơi gara kiểm soát (G1-17)."

probe-scenario: ## Chạy kịch bản thăm dò (GHI dữ liệu thử) trên Worker đã deploy (URL=, PROBE_TOKEN=)
	@[[ -n "$(URL)" && -n "$(PROBE_TOKEN)" ]] || { echo "Cần URL=https://... PROBE_TOKEN=..."; exit 1; }
	curl -sS -X POST $(ACCESS_HDR) -H "x-probe-token: $(PROBE_TOKEN)" "$(URL)/probe/scenario"; echo

probe-limits: ## Đo giới hạn truy vấn mỗi lần gọi (URL=, PROBE_TOKEN=, N=60)
	@[[ -n "$(URL)" && -n "$(PROBE_TOKEN)" ]] || { echo "Cần URL=https://... PROBE_TOKEN=..."; exit 1; }
	curl -sS -X POST $(ACCESS_HDR) -H "x-probe-token: $(PROBE_TOKEN)" "$(URL)/probe/limits?n=$${N:-60}"; echo

# ---------------------------------------------------------------- Cloudflare gói Free (demo), theo thứ tự chạy
cf-login: ## 1. Đăng nhập wrangler và xem tài khoản đang dùng
	npx wrangler login
	npx wrangler whoami

cf-d1: guard ## 2. Tạo D1 (DB=gara24, vùng D1_LOCATION=apac) nếu chưa có, rồi sinh cấu hình (CONFIRM=yes)
	@if id=$(CF_DB_ID); then echo "D1 $(DB) đã có: $$id"; \
	 else npx wrangler d1 create $(DB) --location $(D1_LOCATION); fi
	@$(MAKE) --no-print-directory cf-config

cf-config: ## Sinh .wrangler/deploy/wrangler.json từ wrangler.jsonc + database_id thật (chỉ đọc tài khoản)
	@id=$(CF_DB_ID) || { echo "Không thấy D1 tên $(DB) trong tài khoản. Chạy: make cf-d1 CONFIRM=yes"; exit 1; }; \
	 node scripts/cf-config.mjs --db-id "$$id" --db-name $(DB) --out $(CF_CFG)

cf-env: ## Lưu URL=, ACCESS_CLIENT_ID=, ACCESS_CLIENT_SECRET= vào .wrangler/deploy/demo.env (chỉ trên máy này)
	@mkdir -p $(CF_DIR); touch $(CF_ENV); chmod 600 $(CF_ENV)
	@umask 077; for kv in "URL=$(URL)" "ACCESS_CLIENT_ID=$(ACCESS_CLIENT_ID)" "ACCESS_CLIENT_SECRET=$(ACCESS_CLIENT_SECRET)"; do \
	   k=$${kv%%=*}; v=$${kv#*=}; [[ -z "$$v" ]] && continue; \
	   grep -v "^$$k=" $(CF_ENV) > $(CF_ENV).tmp || true; echo "$$k=$$v" >> $(CF_ENV).tmp; mv $(CF_ENV).tmp $(CF_ENV); \
	   echo "Đã lưu $$k"; done

cf-access: guard cf-ready ## 5. Đặt TEAM= và AUD= của Access làm secret cho Worker (CONFIRM=yes)
	@[[ -n "$(TEAM)" && -n "$(AUD)" ]] || { echo "Cần TEAM=<tên>.cloudflareaccess.com AUD=<Application Audience tag>"; exit 1; }
	@team=$$(echo "$(TEAM)" | sed -E 's#^https?://##; s#/+$$##'); \
	 [[ "$$team" =~ ^[a-z0-9-]+\.cloudflareaccess\.com$$ ]] || { echo "TEAM không hợp lệ: $$team"; exit 1; }; \
	 [[ "$(AUD)" =~ ^[0-9a-f]{64}$$ ]] || { echo "AUD phải là chuỗi hex 64 ký tự"; exit 1; }; \
	 printf %s "$$team" | $(WR) secret put ACCESS_TEAM_DOMAIN && printf %s "$(AUD)" | $(WR) secret put ACCESS_AUD

cf-seed: guard cf-ready web-build ## 6. Nạp dữ liệu demo vào D1 thật qua Worker chạy trên máy (CONFIRM=yes)
	@id=$(CF_DB_ID) || { echo "Không thấy D1 $(DB)"; exit 1; }; scripts/cf-seed.sh "$$id" $(DB)

cf-users: cf-ready ## Liệt kê người dùng demo và email đăng nhập hiện tại
	$(WR) d1 execute $(DB) --remote --command "SELECT id, email, full_name FROM users ORDER BY id"

cf-user: guard cf-ready ## 7. Gán email đăng nhập Access cho người dùng demo: EMAIL= AS=chu (CONFIRM=yes)
	@as="$(AS)"; email=$$(echo "$(EMAIL)" | tr 'A-Z' 'a-z'); \
	 [[ " chu quanly covan tho.tuan tho.hai kho thungan ketoan ndt " == *" $$as "* ]] || { echo "AS= một trong: chu quanly covan tho.tuan tho.hai kho thungan ketoan ndt"; exit 1; }; \
	 [[ "$$email" =~ ^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$$ ]] || { echo "EMAIL không hợp lệ: $$email"; exit 1; }; \
	 $(WR) d1 execute $(DB) --remote --command "UPDATE users SET email = '$$email' WHERE id = 'u-$$as'"

cf-check: ## 8. Kiểm Access chặn trước Worker và route demo đã tắt (URL=, tùy chọn service token)
	@[[ -n "$(URL)" ]] || { echo "Cần URL=https://... (hoặc make cf-env URL=...)"; exit 1; }
	ACCESS_CLIENT_ID="$(ACCESS_CLIENT_ID)" ACCESS_CLIENT_SECRET="$(ACCESS_CLIENT_SECRET)" scripts/cf-check.sh "$(URL)"

cf-probe-on: guard cf-ready ## 9a. Sinh PROBE_TOKEN ngẫu nhiên, đặt làm secret, lưu vào demo.env (CONFIRM=yes)
	@mkdir -p $(CF_DIR); touch $(CF_ENV); chmod 600 $(CF_ENV)
	@umask 077; t=$$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))'); \
	 printf %s "$$t" | $(WR) secret put PROBE_TOKEN && \
	 { grep -v '^PROBE_TOKEN=' $(CF_ENV) > $(CF_ENV).tmp || true; echo "PROBE_TOKEN=$$t" >> $(CF_ENV).tmp; mv $(CF_ENV).tmp $(CF_ENV); }

cf-probe: ## 9b. Đo trần truy vấn ở N=60 và N=200, in kết luận (URL=, service token, PROBE_TOKEN)
	@[[ -n "$(URL)" && -n "$(PROBE_TOKEN)" ]] || { echo "Cần URL (make cf-env) và PROBE_TOKEN (make cf-probe-on CONFIRM=yes)"; exit 1; }
	@for n in 60 200; do echo "== probe-limits n=$$n"; \
	   out=$$(curl -sS -X POST $(ACCESS_HDR) -H "x-probe-token: $(PROBE_TOKEN)" "$(URL)/probe/limits?n=$$n"); \
	   echo "$$out"; echo "$$out" | node scripts/probe-verdict.mjs || exit 1; echo; done

cf-probe-off: guard cf-ready ## 9c. Xóa secret PROBE_TOKEN sau khi đo (CONFIRM=yes)
	$(WR) secret delete PROBE_TOKEN
	@umask 077; grep -v '^PROBE_TOKEN=' $(CF_ENV) > $(CF_ENV).tmp 2>/dev/null; mv $(CF_ENV).tmp $(CF_ENV) 2>/dev/null; true

# ---------------------------------------------------------------- quy trình patch
bundle: ## Đóng gói cả repo thành một file để gửi kèm chat (khi không dùng GitHub)
	git bundle create gara24-$(STAMP).bundle --all

patch-apply: ## Áp patch từ Claude: make patch-apply P=0003-xyz.patch
	@[[ -n "$(P)" ]] || { echo "Cần P=<file.patch>"; exit 1; }
	@git diff --quiet && git diff --cached --quiet || { echo "Cây làm việc chưa sạch"; exit 1; }
	@test -x node_modules/.bin/wrangler || { echo "Chưa cài phụ thuộc nên không chạy được test sau khi áp. Chạy: make install"; exit 1; }
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
