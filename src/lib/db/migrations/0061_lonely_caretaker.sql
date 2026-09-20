ALTER TABLE `segments` ADD `permanent` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `segments` ADD `expires_at` integer;