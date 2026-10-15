CREATE TABLE `engine_waits` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`node_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`event_key` text NOT NULL,
	`config` text NOT NULL,
	`since` integer NOT NULL,
	`until` integer NOT NULL,
	`resolved_at` integer,
	`outcome` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_engine_waits_open` ON `engine_waits` (`contact_id`,`resolved_at`);--> statement-breakpoint
CREATE INDEX `idx_engine_waits_run` ON `engine_waits` (`run_id`,`node_id`);