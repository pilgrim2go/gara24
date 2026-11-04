CREATE TABLE `accounting_periods` (
	`branch_id` text NOT NULL,
	`period` text NOT NULL,
	`status` text NOT NULL,
	`closed_at` integer,
	`closed_by` text,
	PRIMARY KEY(`branch_id`, `period`),
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`vehicle_id` text,
	`plate_text` text,
	`party_id` text,
	`phone_text` text,
	`scheduled_at` integer NOT NULL,
	`scheduled_biz_date` text NOT NULL,
	`planned_bay_id` text,
	`job_note` text,
	`status` text NOT NULL,
	`work_order_id` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`planned_bay_id`) REFERENCES `bays`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `appt_date_idx` ON `appointments` (`branch_id`,`scheduled_biz_date`);--> statement-breakpoint
CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`kind` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`requested_json` text NOT NULL,
	`threshold_json` text,
	`status` text NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` integer NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`note` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ar_status_idx` ON `approval_requests` (`branch_id`,`status`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`at` integer NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`changes_json` text,
	`sensitive` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`request_id` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "audit_sensitive_bool" CHECK("audit_log"."sensitive" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`branch_id`,`entity`,`entity_id`,`at`);--> statement-breakpoint
CREATE INDEX `audit_at_idx` ON `audit_log` (`branch_id`,`at`);--> statement-breakpoint
CREATE TABLE `bank_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_txn_id` text NOT NULL,
	`account_last4` text,
	`amount_vnd` integer NOT NULL,
	`memo` text,
	`txn_at` integer NOT NULL,
	`match_status` text NOT NULL,
	`payment_intent_id` text,
	`raw_r2_key` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bt_match_chk" CHECK("bank_transactions"."match_status" IN ('auto', 'manual', 'unmatched', 'ignored'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bt_txn_uq` ON `bank_transactions` (`provider`,`provider_txn_id`);--> statement-breakpoint
CREATE INDEX `bt_match_idx` ON `bank_transactions` (`branch_id`,`match_status`);--> statement-breakpoint
CREATE TABLE `bays` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bays_code_uq` ON `bays` (`branch_id`,`code`);--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`legal_entity_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`tz` text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	`open_hours_json` text,
	`created_at` integer DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) NOT NULL,
	FOREIGN KEY (`legal_entity_id`) REFERENCES `legal_entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branches_code_unique` ON `branches` (`code`);--> statement-breakpoint
CREATE TABLE `cash_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`holder_id` text NOT NULL,
	`opened_at` integer NOT NULL,
	`opening_float_vnd` integer NOT NULL,
	`closed_at` integer,
	`expected_vnd` integer,
	`counted_vnd` integer,
	`variance_vnd` integer,
	`denominations_json` text,
	`closed_by` text,
	`status` text NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holder_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cs_open_uq` ON `cash_sessions` (`branch_id`,`holder_id`) WHERE status = 'open';--> statement-breakpoint
CREATE TABLE `cost_layers` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`item_id` text NOT NULL,
	`receipt_move_id` text NOT NULL,
	`qty_remaining_m` integer NOT NULL,
	`unit_cost_vnd` integer NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_move_id`) REFERENCES `stock_moves`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cl_item_idx` ON `cost_layers` (`warehouse_id`,`item_id`,`receipt_move_id`);--> statement-breakpoint
CREATE TABLE `cost_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`period` text NOT NULL,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`moves_updated` integer,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cr_period_uq` ON `cost_runs` (`branch_id`,`period`,`method`);--> statement-breakpoint
CREATE TABLE `daily_advisor_stats` (
	`branch_id` text NOT NULL,
	`biz_date` text NOT NULL,
	`advisor_id` text NOT NULL,
	`orders_completed` integer DEFAULT 0 NOT NULL,
	`rev_labor_vnd` integer DEFAULT 0 NOT NULL,
	`rev_parts_vnd` integer DEFAULT 0 NOT NULL,
	`manual_discount_count` integer DEFAULT 0 NOT NULL,
	`manual_discount_vnd` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`branch_id`, `biz_date`, `advisor_id`),
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`advisor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `daily_bay_stats` (
	`branch_id` text NOT NULL,
	`biz_date` text NOT NULL,
	`bay_id` text NOT NULL,
	`occupied_minutes` integer DEFAULT 0 NOT NULL,
	`orders_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`branch_id`, `biz_date`, `bay_id`),
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bay_id`) REFERENCES `bays`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `daily_branch_stats` (
	`branch_id` text NOT NULL,
	`biz_date` text NOT NULL,
	`orders_received` integer DEFAULT 0 NOT NULL,
	`orders_completed` integer DEFAULT 0 NOT NULL,
	`orders_delivered` integer DEFAULT 0 NOT NULL,
	`orders_cancelled` integer DEFAULT 0 NOT NULL,
	`rev_labor_completed_vnd` integer DEFAULT 0 NOT NULL,
	`rev_parts_completed_vnd` integer DEFAULT 0 NOT NULL,
	`discount_completed_vnd` integer DEFAULT 0 NOT NULL,
	`rev_invoiced_vnd` integer DEFAULT 0 NOT NULL,
	`collected_vnd` integer DEFAULT 0 NOT NULL,
	`cash_in_vnd` integer DEFAULT 0 NOT NULL,
	`qr_in_vnd` integer DEFAULT 0 NOT NULL,
	`refund_out_vnd` integer DEFAULT 0 NOT NULL,
	`cogs_completed_vnd` integer DEFAULT 0 NOT NULL,
	`cogs_provisional_vnd` integer DEFAULT 0 NOT NULL,
	`stock_in_value_vnd` integer DEFAULT 0 NOT NULL,
	`stock_out_value_vnd` integer DEFAULT 0 NOT NULL,
	`opex_vnd` integer DEFAULT 0 NOT NULL,
	`manual_discount_count` integer DEFAULT 0 NOT NULL,
	`reopen_count` integer DEFAULT 0 NOT NULL,
	`prior_period_adjust_vnd` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`branch_id`, `biz_date`),
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `data_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`kind` text NOT NULL,
	`r2_key` text NOT NULL,
	`sha256` text,
	`at` integer NOT NULL,
	`by` text NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `de_at_idx` ON `data_exports` (`branch_id`,`at`);--> statement-breakpoint
CREATE TABLE `_guard` (
	`code` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`user_id` text NOT NULL,
	`op` text NOT NULL,
	`result_ref` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`source_line_id` text,
	`description` text NOT NULL,
	`uom` text,
	`qty_m` integer NOT NULL,
	`unit_price_vnd` integer NOT NULL,
	`discount_vnd` integer DEFAULT 0 NOT NULL,
	`vat_category` text NOT NULL,
	`vat_rate_bp` integer,
	`amount_vnd` integer NOT NULL,
	`vat_vnd` integer NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_line_id`) REFERENCES `work_order_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `il_inv_idx` ON `invoice_lines` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`legal_entity_id` text,
	`work_order_id` text NOT NULL,
	`payer_party_id` text,
	`invoice_kind` text,
	`status` text NOT NULL,
	`provider` text,
	`template_code` text,
	`series` text,
	`invoice_no` text,
	`issued_at` integer,
	`issued_biz_date` text,
	`subtotal_vnd` integer,
	`vat_vnd` integer,
	`total_vnd` integer,
	`buyer_snapshot_json` text,
	`replaces_invoice_id` text,
	`provider_ref` text,
	`last_error` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`legal_entity_id`) REFERENCES `legal_entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payer_party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inv_status_chk" CHECK("invoices"."status" IN ('draft', 'issuing', 'issued', 'failed', 'replaced', 'adjusted', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `inv_wo_idx` ON `invoices` (`work_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inv_no_uq` ON `invoices` (`provider`,`series`,`invoice_no`) WHERE invoice_no IS NOT NULL;--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`code` text NOT NULL,
	`misa_code` text,
	`name` text NOT NULL,
	`item_type` text NOT NULL,
	`uom` text NOT NULL,
	`track_stock` integer DEFAULT 1 NOT NULL,
	`allow_negative` integer DEFAULT 0 NOT NULL,
	`default_price_vnd` integer,
	`vat_rate_bp` integer,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_code_unique` ON `items` (`code`);--> statement-breakpoint
CREATE INDEX `items_misa_idx` ON `items` (`misa_code`);--> statement-breakpoint
CREATE TABLE `legal_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`tax_code` text,
	`entity_type` text,
	`vat_method` text,
	`einvoice_provider` text,
	`einvoice_series` text,
	`created_at` integer DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_entities_code_unique` ON `legal_entities` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `le_tax_uq` ON `legal_entities` (`tax_code`) WHERE tax_code IS NOT NULL;--> statement-breakpoint
CREATE TABLE `misa_account_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`item_type` text NOT NULL,
	`revenue_account` text,
	`cogs_account` text,
	`inventory_account` text,
	`effective_from` text NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mar_idx` ON `misa_account_rules` (`branch_id`,`item_type`,`effective_from`);--> statement-breakpoint
CREATE TABLE `misa_export_items` (
	`export_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`doc_table` text NOT NULL,
	`doc_id` text NOT NULL,
	`doc_version` integer NOT NULL,
	PRIMARY KEY(`export_id`, `doc_table`, `doc_id`),
	FOREIGN KEY (`export_id`) REFERENCES `misa_exports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mei_doc_uq` ON `misa_export_items` (`doc_table`,`doc_id`,`doc_version`);--> statement-breakpoint
CREATE TABLE `misa_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`period` text NOT NULL,
	`kind` text NOT NULL,
	`template_version` text NOT NULL,
	`file_r2_key` text,
	`row_count` integer,
	`sha256` text,
	`generated_by` text NOT NULL,
	`generated_at` integer NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `me_period_idx` ON `misa_exports` (`branch_id`,`period`);--> statement-breakpoint
CREATE TABLE `old_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`work_order_line_id` text NOT NULL,
	`qty_m` integer NOT NULL,
	`disposition` text NOT NULL,
	`decided_by` text NOT NULL,
	`decided_at` integer NOT NULL,
	`customer_ack_at` integer,
	`scrap_stock_doc_id` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_line_id`) REFERENCES `work_order_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scrap_stock_doc_id`) REFERENCES `stock_docs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `op_line_idx` ON `old_parts` (`work_order_line_id`);--> statement-breakpoint
CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`code` text NOT NULL,
	`misa_code` text,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`tax_code` text,
	`is_customer` integer DEFAULT 1 NOT NULL,
	`is_supplier` integer DEFAULT 0 NOT NULL,
	`is_insurer` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parties_code_unique` ON `parties` (`code`);--> statement-breakpoint
CREATE INDEX `parties_tax_idx` ON `parties` (`tax_code`);--> statement-breakpoint
CREATE INDEX `parties_misa_idx` ON `parties` (`misa_code`);--> statement-breakpoint
CREATE TABLE `party_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`party_id` text NOT NULL,
	`phone_e164` text,
	`email` text,
	`address` text,
	`consent_marketing` integer,
	`anonymized_at` integer,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pc_phone_idx` ON `party_contacts` (`phone_e164`);--> statement-breakpoint
CREATE INDEX `pc_party_idx` ON `party_contacts` (`party_id`);--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`target` text NOT NULL,
	`work_order_id` text,
	`invoice_id` text,
	`amount_vnd` integer NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "pa_target_chk" CHECK("payment_allocations"."target" IN ('work_order', 'advance', 'scrap_sale'))
);
--> statement-breakpoint
CREATE INDEX `pa_wo_idx` ON `payment_allocations` (`work_order_id`);--> statement-breakpoint
CREATE INDEX `pa_pay_idx` ON `payment_allocations` (`payment_id`);--> statement-breakpoint
CREATE TABLE `payment_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`amount_vnd` integer NOT NULL,
	`order_version` integer NOT NULL,
	`transfer_ref` text NOT NULL,
	`qr_payload` text,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`bank_txn_id` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bank_txn_id`) REFERENCES `bank_transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "pi_status_chk" CHECK("payment_intents"."status" IN ('pending', 'matched', 'expired', 'void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_intents_transfer_ref_unique` ON `payment_intents` (`transfer_ref`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`doc_no` text NOT NULL,
	`direction` text NOT NULL,
	`method` text NOT NULL,
	`amount_vnd` integer NOT NULL,
	`party_id` text,
	`biz_date` text NOT NULL,
	`at` integer NOT NULL,
	`cash_session_id` text,
	`bank_txn_id` text,
	`expense_category` text,
	`status` text NOT NULL,
	`reverses_payment_id` text,
	`note` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cash_session_id`) REFERENCES `cash_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bank_txn_id`) REFERENCES `bank_transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "pay_amount_pos" CHECK("payments"."amount_vnd" > 0),
	CONSTRAINT "pay_dir_chk" CHECK("payments"."direction" IN ('in', 'out')),
	CONSTRAINT "pay_method_chk" CHECK("payments"."method" IN ('cash', 'qr', 'transfer', 'card'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pay_no_uq` ON `payments` (`branch_id`,`doc_no`);--> statement-breakpoint
CREATE INDEX `pay_date_idx` ON `payments` (`branch_id`,`biz_date`);--> statement-breakpoint
CREATE INDEX `pay_session_idx` ON `payments` (`cash_session_id`);--> statement-breakpoint
CREATE TABLE `period_events` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`period` text NOT NULL,
	`action` text NOT NULL,
	`at` integer NOT NULL,
	`by` text NOT NULL,
	`reason` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pe_period_idx` ON `period_events` (`branch_id`,`period`);--> statement-breakpoint
CREATE TABLE `period_snapshots` (
	`branch_id` text NOT NULL,
	`period` text NOT NULL,
	`totals_json` text NOT NULL,
	`source_checksum` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	PRIMARY KEY(`branch_id`, `period`),
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sequences` (
	`branch_id` text NOT NULL,
	`seq_key` text NOT NULL,
	`last_value` integer NOT NULL,
	PRIMARY KEY(`branch_id`, `seq_key`),
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`branch_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`effective_from` text NOT NULL,
	`set_by` text NOT NULL,
	`reason` text,
	`set_at` integer DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) NOT NULL,
	PRIMARY KEY(`branch_id`, `key`, `effective_from`),
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stock_balances` (
	`warehouse_id` text NOT NULL,
	`item_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`on_hand_qty_m` integer DEFAULT 0 NOT NULL,
	`on_hand_value_vnd` integer DEFAULT 0 NOT NULL,
	`last_unit_cost_vnd` integer DEFAULT 0 NOT NULL,
	`allow_negative` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`warehouse_id`, `item_id`),
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_not_negative" CHECK("stock_balances"."on_hand_qty_m" >= 0 OR "stock_balances"."allow_negative" = 1)
);
--> statement-breakpoint
CREATE TABLE `stock_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`doc_no` text NOT NULL,
	`doc_type` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`work_order_id` text,
	`supplier_party_id` text,
	`supplier_invoice_no` text,
	`supplier_invoice_date` text,
	`subtotal_vnd` integer,
	`vat_vnd` integer,
	`total_vnd` integer,
	`biz_date` text NOT NULL,
	`reverses_doc_id` text,
	`status` text NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sd_type_chk" CHECK("stock_docs"."doc_type" IN ('purchase_receipt', 'order_issue', 'order_return', 'supplier_return', 'adjustment', 'transfer_out', 'transfer_in', 'scrap_sale'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sd_no_uq` ON `stock_docs` (`branch_id`,`doc_no`);--> statement-breakpoint
CREATE INDEX `sd_wo_idx` ON `stock_docs` (`work_order_id`);--> statement-breakpoint
CREATE INDEX `sd_date_idx` ON `stock_docs` (`branch_id`,`biz_date`);--> statement-breakpoint
CREATE TABLE `stock_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`stock_doc_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`item_id` text NOT NULL,
	`qty_delta_m` integer NOT NULL,
	`total_cost_vnd` integer NOT NULL,
	`cost_status` text NOT NULL,
	`costing_method` text NOT NULL,
	`work_order_id` text,
	`work_order_line_id` text,
	`biz_date` text NOT NULL,
	`reverses_move_id` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stock_doc_id`) REFERENCES `stock_docs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_line_id`) REFERENCES `work_order_lines`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "move_qty_nonzero" CHECK("stock_moves"."qty_delta_m" <> 0),
	CONSTRAINT "move_cost_non_negative" CHECK("stock_moves"."total_cost_vnd" >= 0),
	CONSTRAINT "sm_coststatus_chk" CHECK("stock_moves"."cost_status" IN ('final', 'provisional'))
);
--> statement-breakpoint
CREATE INDEX `sm_item_date_idx` ON `stock_moves` (`branch_id`,`item_id`,`biz_date`);--> statement-breakpoint
CREATE INDEX `sm_wo_idx` ON `stock_moves` (`work_order_id`);--> statement-breakpoint
CREATE INDEX `sm_line_idx` ON `stock_moves` (`work_order_line_id`);--> statement-breakpoint
CREATE INDEX `sm_doc_idx` ON `stock_moves` (`stock_doc_id`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`role` text NOT NULL,
	`granted_by` text NOT NULL,
	`granted_at` integer DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) NOT NULL,
	`revoked_at` integer,
	PRIMARY KEY(`user_id`, `branch_id`, `role`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ur_role_chk" CHECK("user_roles"."role" IN ('owner', 'manager', 'advisor', 'technician', 'accountant', 'investor', 'storekeeper', 'cashier'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`pin_hash` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `vehicle_ownerships` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`party_id` text NOT NULL,
	`from_at` integer NOT NULL,
	`to_at` integer,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vo_vehicle_idx` ON `vehicle_ownerships` (`vehicle_id`,`to_at`);--> statement-breakpoint
CREATE INDEX `vo_party_idx` ON `vehicle_ownerships` (`party_id`);--> statement-breakpoint
CREATE TABLE `vehicle_plates` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`plate_norm` text NOT NULL,
	`plate_display` text NOT NULL,
	`valid_from` integer NOT NULL,
	`valid_to` integer,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vp_plate_idx` ON `vehicle_plates` (`plate_norm`);--> statement-breakpoint
CREATE UNIQUE INDEX `vp_current_uq` ON `vehicle_plates` (`plate_norm`) WHERE valid_to IS NULL;--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`vin` text,
	`make` text,
	`model` text,
	`model_year` integer,
	`engine_code` text,
	`fuel` text,
	`last_odometer_km` integer,
	`last_odometer_at` integer,
	`created_at` integer DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicles_vin_uq` ON `vehicles` (`vin`) WHERE vin IS NOT NULL;--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wh_code_uq` ON `warehouses` (`branch_id`,`code`);--> statement-breakpoint
CREATE TABLE `work_order_costs` (
	`work_order_id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`parts_cost_vnd` integer DEFAULT 0 NOT NULL,
	`sublet_cost_vnd` integer DEFAULT 0 NOT NULL,
	`cost_status` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`kind` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`at` integer NOT NULL,
	`by` text NOT NULL,
	`reason` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "woe_kind_chk" CHECK("work_order_events"."kind" IN ('status', 'lock', 'unlock', 'reopen'))
);
--> statement-breakpoint
CREATE INDEX `woe_order_idx` ON `work_order_events` (`work_order_id`,`at`);--> statement-breakpoint
CREATE TABLE `work_order_holds` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`line_id` text,
	`reason` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`note` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `woh_order_idx` ON `work_order_holds` (`work_order_id`);--> statement-breakpoint
CREATE INDEX `woh_open_idx` ON `work_order_holds` (`branch_id`) WHERE ended_at IS NULL;--> statement-breakpoint
CREATE TABLE `work_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`line_type` text NOT NULL,
	`item_id` text,
	`description` text NOT NULL,
	`qty_m` integer NOT NULL,
	`unit_price_vnd` integer NOT NULL,
	`gross_vnd` integer NOT NULL,
	`discount_vnd` integer DEFAULT 0 NOT NULL,
	`net_vnd` integer NOT NULL,
	`vat_rate_bp` integer,
	`vat_vnd` integer DEFAULT 0 NOT NULL,
	`issued_qty_m` integer DEFAULT 0 NOT NULL,
	`approval_status` text DEFAULT 'approved' NOT NULL,
	`approved_at` integer,
	`source` text DEFAULT 'quote' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`part_tier` text,
	`std_hours_m` integer,
	`warranty_months` integer,
	`warranty_km` integer,
	`cancelled_at` integer,
	`cancelled_by` text,
	`cancel_reason_code` text,
	`cancel_reason` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "wol_qty_pos" CHECK("work_order_lines"."qty_m" > 0),
	CONSTRAINT "wol_price_nonneg" CHECK("work_order_lines"."unit_price_vnd" >= 0),
	CONSTRAINT "issued_within_line" CHECK("work_order_lines"."issued_qty_m" >= 0 AND "work_order_lines"."issued_qty_m" <= "work_order_lines"."qty_m"),
	CONSTRAINT "wol_type_chk" CHECK("work_order_lines"."line_type" IN ('labor', 'part', 'sublet', 'fee')),
	CONSTRAINT "wol_status_chk" CHECK("work_order_lines"."status" IN ('active', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `wol_order_idx` ON `work_order_lines` (`work_order_id`,`line_no`);--> statement-breakpoint
CREATE TABLE `work_order_payers` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`party_id` text NOT NULL,
	`payer_role` text NOT NULL,
	`share_kind` text NOT NULL,
	`share_value` integer,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wop_order_idx` ON `work_order_payers` (`work_order_id`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`order_seq` integer,
	`order_no` text,
	`vehicle_id` text NOT NULL,
	`customer_party_id` text,
	`advisor_id` text,
	`bay_id` text,
	`odometer_in_km` integer,
	`complaint` text,
	`status` text NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`received_at` integer NOT NULL,
	`promised_at` integer,
	`completed_at` integer,
	`delivered_at` integer,
	`fully_paid_at` integer,
	`closed_at` integer,
	`received_biz_date` text NOT NULL,
	`completed_biz_date` text,
	`labor_gross_vnd` integer DEFAULT 0 NOT NULL,
	`parts_gross_vnd` integer DEFAULT 0 NOT NULL,
	`discount_vnd` integer DEFAULT 0 NOT NULL,
	`vat_vnd` integer DEFAULT 0 NOT NULL,
	`grand_total_vnd` integer DEFAULT 0 NOT NULL,
	`paid_vnd` integer DEFAULT 0 NOT NULL,
	`locked_at` integer,
	`lock_reason` text,
	`lock_policy` text NOT NULL,
	`policy_snapshot_json` text,
	`reopen_count` integer DEFAULT 0 NOT NULL,
	`cancelled_at` integer,
	`cancelled_by` text,
	`cancel_reason_code` text,
	`cancel_reason` text,
	`created_by` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`advisor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bay_id`) REFERENCES `bays`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "wo_paid_nonneg" CHECK("work_orders"."paid_vnd" >= 0),
	CONSTRAINT "wo_status_chk" CHECK("work_orders"."status" IN ('received', 'quoted', 'approved', 'in_progress', 'qc', 'delivered', 'closed', 'cancelled')),
	CONSTRAINT "wo_paystatus_chk" CHECK("work_orders"."payment_status" IN ('unpaid', 'partial', 'paid', 'on_account')),
	CONSTRAINT "wo_lockpolicy_chk" CHECK("work_orders"."lock_policy" IN ('invoice_or_paid', 'paid', 'invoice'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wo_no_uq` ON `work_orders` (`branch_id`,`order_no`);--> statement-breakpoint
CREATE INDEX `wo_board_idx` ON `work_orders` (`branch_id`,`status`,`promised_at`);--> statement-breakpoint
CREATE INDEX `wo_vehicle_idx` ON `work_orders` (`vehicle_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `wo_completed_idx` ON `work_orders` (`branch_id`,`completed_biz_date`);