ALTER TABLE `automations` ADD `quiet_hours` text DEFAULT 'respect' NOT NULL;--> statement-breakpoint
ALTER TABLE `engine_settings` ADD `send_from` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `engine_settings` ADD `send_to` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `engine_settings` ADD `per_hour_limit` integer;--> statement-breakpoint
ALTER TABLE `engine_settings` ADD `per_day_limit` integer;--> statement-breakpoint
ALTER TABLE `engine_settings` ADD `hour_window_at` integer;--> statement-breakpoint
ALTER TABLE `engine_settings` ADD `hour_sent_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `engine_settings` ADD `day_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `engine_settings` ADD `day_sent_count` integer DEFAULT 0 NOT NULL;