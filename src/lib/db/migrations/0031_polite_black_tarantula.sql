CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`template_name` text NOT NULL,
	`segment_id` text NOT NULL,
	`segment_name` text DEFAULT '' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`scheduled_at` integer,
	`recount_at` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`audience_count` integer,
	`sent_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_campaigns_status` ON `campaigns` (`status`);