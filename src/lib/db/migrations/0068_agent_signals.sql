CREATE TABLE `agent_models` (
	`id` text PRIMARY KEY NOT NULL,
	`trained_at` integer NOT NULL,
	`samples` integer NOT NULL,
	`params` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`contact_id` text NOT NULL,
	`visit_id` text,
	`score` real NOT NULL,
	`factors` text DEFAULT '[]' NOT NULL,
	`computed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_scores_kind` ON `agent_scores` (`kind`,`score`);--> statement-breakpoint
CREATE TABLE `agent_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`key` text NOT NULL,
	`dimension` text DEFAULT '' NOT NULL,
	`value` real NOT NULL,
	`previous` real,
	`count` integer DEFAULT 0 NOT NULL,
	`detail` text,
	`computed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_signals_day_key` ON `agent_signals` (`day`,`key`,`dimension`);