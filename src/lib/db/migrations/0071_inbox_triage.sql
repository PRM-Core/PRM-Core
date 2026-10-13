ALTER TABLE `inbox_threads` ADD `triage_urgency` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_threads` ADD `triage_topic` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_threads` ADD `triage_owner` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_threads` ADD `triage_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_threads` ADD `triage_source` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_threads` ADD `triage_at` integer;