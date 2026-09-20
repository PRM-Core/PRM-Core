CREATE TABLE `contact_statuses` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`color` text DEFAULT '' NOT NULL,
	`builtin` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `contact_field_defs` ADD `statuses` text DEFAULT '[]' NOT NULL;