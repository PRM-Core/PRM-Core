CREATE TABLE `tracking_domains` (
	`domain` text PRIMARY KEY NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tracking_pings` ADD `host` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_pings_host` ON `tracking_pings` (`host`);