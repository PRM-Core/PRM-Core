CREATE TABLE `contact_funnel_progress` (
	`contact_id` text PRIMARY KEY NOT NULL,
	`funnel_id` text NOT NULL,
	`stage_index` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `funnels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`stages` text NOT NULL,
	`updated_at` text NOT NULL
);
