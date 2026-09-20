CREATE TABLE `ai_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text DEFAULT 'anthropic' NOT NULL,
	`model` text DEFAULT 'claude-opus-5' NOT NULL,
	`daily_limit_usd` real DEFAULT 5 NOT NULL,
	`updated_at` text NOT NULL
);
