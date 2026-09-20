CREATE TABLE `agent_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`signature` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`proposed_action` text DEFAULT '' NOT NULL,
	`evidence` text,
	`automation_id` text,
	`status` text DEFAULT 'new' NOT NULL,
	`from_ai` integer DEFAULT 0 NOT NULL,
	`seen_count` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_insights_signature_unique` ON `agent_insights` (`signature`);