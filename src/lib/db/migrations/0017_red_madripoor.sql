CREATE TABLE `popup_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`content_item_id` text NOT NULL,
	`name` text NOT NULL,
	`html` text NOT NULL,
	`config` text NOT NULL,
	`automation_id` text,
	`run_id` text,
	`node_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`shown_at` integer
);
--> statement-breakpoint
ALTER TABLE `content_snapshots` ADD `config` text;