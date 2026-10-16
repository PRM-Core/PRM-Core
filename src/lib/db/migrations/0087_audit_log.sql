CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`actor_id` text DEFAULT '' NOT NULL,
	`actor_name` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`detail` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_at` ON `audit_log` (`at`);--> statement-breakpoint
CREATE INDEX `idx_audit_action` ON `audit_log` (`action`,`at`);