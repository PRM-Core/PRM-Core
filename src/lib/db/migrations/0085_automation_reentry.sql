ALTER TABLE `automations` ADD `reentry` text DEFAULT 'always' NOT NULL;--> statement-breakpoint
ALTER TABLE `automations` ADD `reentry_days` integer DEFAULT 30 NOT NULL;