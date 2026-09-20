CREATE TABLE `contact_treatment_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`assigned_by` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`assigned_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `treatment_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_contact_plans` ON `contact_treatment_plans` (`contact_id`,`assigned_at`);--> statement-breakpoint
CREATE TABLE `treatment_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `campaigns` ADD `per_hour_limit` integer;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `per_day_limit` integer;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `hour_window_at` integer;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `hour_sent_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `day_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `day_sent_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `throttled_until` integer;