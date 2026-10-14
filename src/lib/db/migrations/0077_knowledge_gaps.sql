CREATE TABLE `knowledge_gaps` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`question` text NOT NULL,
	`source` text DEFAULT 'inbox' NOT NULL,
	`thread_id` text,
	`count` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_gaps_key_unique` ON `knowledge_gaps` (`key`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_gaps_status` ON `knowledge_gaps` (`status`,`last_at`);