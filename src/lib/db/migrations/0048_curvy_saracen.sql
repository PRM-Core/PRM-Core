CREATE TABLE `feed_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`feed_id` text NOT NULL,
	`key_value` text DEFAULT '' NOT NULL,
	`row_index` integer NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_feed_rows_key` ON `feed_rows` (`feed_id`,`key_value`);--> statement-breakpoint
CREATE TABLE `feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`columns` text DEFAULT '[]' NOT NULL,
	`key_column` text DEFAULT '' NOT NULL,
	`source_file` text DEFAULT '' NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
