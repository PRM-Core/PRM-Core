CREATE TABLE `email_senders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `content_items` ADD `sender_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `content_snapshots` ADD `sender_id` text DEFAULT '' NOT NULL;