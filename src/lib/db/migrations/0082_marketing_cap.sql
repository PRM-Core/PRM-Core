CREATE TABLE `marketing_touches` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`channel` text NOT NULL,
	`source` text NOT NULL,
	`automation_id` text,
	`campaign_id` text,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_marketing_touches_contact` ON `marketing_touches` (`contact_id`,`sent_at`);--> statement-breakpoint
ALTER TABLE `engine_settings` ADD `marketing_per_week` integer;