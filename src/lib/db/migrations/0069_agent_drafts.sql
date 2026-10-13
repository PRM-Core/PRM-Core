CREATE TABLE `agent_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'campaign' NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`audience_signal` text NOT NULL,
	`title` text NOT NULL,
	`channel` text NOT NULL,
	`message` text NOT NULL,
	`audience_count` integer DEFAULT 0 NOT NULL,
	`audience_ids` text DEFAULT '[]' NOT NULL,
	`evidence` text,
	`segment_name` text DEFAULT '' NOT NULL,
	`segment_id` text,
	`template_name` text DEFAULT '' NOT NULL,
	`campaign_id` text,
	`decided_by` text DEFAULT '' NOT NULL,
	`decided_at` integer,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_drafts_status` ON `agent_drafts` (`status`,`updated_at`);