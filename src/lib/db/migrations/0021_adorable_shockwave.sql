CREATE TABLE `inbox_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`direction` text NOT NULL,
	`channel` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`html` text,
	`source` text NOT NULL,
	`external_id` text,
	`sent_by_user_id` text,
	`send_token` text,
	`created_at` integer NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_messages_external_id_unique` ON `inbox_messages` (`external_id`);--> statement-breakpoint
CREATE INDEX `idx_inbox_messages_thread` ON `inbox_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `inbox_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`channel` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`last_preview` text DEFAULT '' NOT NULL,
	`last_direction` text DEFAULT 'in' NOT NULL,
	`last_message_at` integer NOT NULL,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_user_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inbox_threads_contact_channel` ON `inbox_threads` (`contact_id`,`channel`);--> statement-breakpoint
CREATE INDEX `idx_inbox_threads_recent` ON `inbox_threads` (`status`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `inbox_webhook_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email_secret` text NOT NULL,
	`updated_at` text NOT NULL
);
