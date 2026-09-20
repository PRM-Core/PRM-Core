CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`current_node_id` text,
	`status` text DEFAULT 'running' NOT NULL,
	`path` text NOT NULL,
	`trigger_event_id` text,
	`last_error` text,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE TABLE `content_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`content_item_id` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`sms_body` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `engine_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`contact_id` text,
	`payload` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE TABLE `engine_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`node_id` text NOT NULL,
	`due_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engine_jobs_idempotency_key_unique` ON `engine_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `engine_log` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text,
	`automation_id` text,
	`contact_id` text,
	`node_id` text,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`detail` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`cost_usd` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `engine_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`base_url` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
