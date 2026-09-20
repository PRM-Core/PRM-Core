CREATE TABLE `content_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'blocks' NOT NULL,
	`blocks` text NOT NULL,
	`sms_body` text DEFAULT '' NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`file_names` text,
	`popup_config` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_items_kind` ON `content_items` (`kind`,`updated_at`);