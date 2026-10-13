CREATE TABLE `agent_briefs` (
	`day` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`polished` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `agent_drafts` ADD `template_message` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_drafts` ADD `text_source` text DEFAULT 'template' NOT NULL;