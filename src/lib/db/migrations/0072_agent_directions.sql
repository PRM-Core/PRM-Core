CREATE TABLE `agent_directions` (
	`key` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`evidence` text,
	`proposed_at` integer NOT NULL,
	`decided_by` text DEFAULT '' NOT NULL,
	`decided_at` integer,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_examples` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'draft' NOT NULL,
	`channel` text NOT NULL,
	`audience_signal` text DEFAULT '' NOT NULL,
	`text` text NOT NULL,
	`decided_by` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_examples_kind` ON `agent_examples` (`kind`,`created_at`);