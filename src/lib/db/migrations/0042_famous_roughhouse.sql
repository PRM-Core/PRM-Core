CREATE TABLE `media_files` (
	`id` text PRIMARY KEY NOT NULL,
	`folder` text DEFAULT 'inne' NOT NULL,
	`file_name` text NOT NULL,
	`stored_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_media_files_folder` ON `media_files` (`folder`,`created_at`);