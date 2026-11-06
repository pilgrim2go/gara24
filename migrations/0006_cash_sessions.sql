ALTER TABLE `cash_sessions` ADD `biz_date` text;--> statement-breakpoint
ALTER TABLE `cash_sessions` ADD `opening_denominations_json` text;--> statement-breakpoint
ALTER TABLE `cash_sessions` ADD `variance_reason` text;--> statement-breakpoint
CREATE INDEX `cs_branch_opened_idx` ON `cash_sessions` (`branch_id`,`opened_at`);