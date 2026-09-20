CREATE TABLE `copilot_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`tools` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`cost_usd` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_copilot_conversation` ON `copilot_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_copilot_user_recent` ON `copilot_messages` (`user_id`,`created_at`);