ALTER TABLE `ai_settings` ADD `daily_call_limit` integer DEFAULT 2000 NOT NULL;--> statement-breakpoint
ALTER TABLE `automations` ADD `ai_calls_per_day` integer DEFAULT 100 NOT NULL;