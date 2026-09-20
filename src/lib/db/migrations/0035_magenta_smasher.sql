CREATE TABLE `doctors` (
	`id` text PRIMARY KEY NOT NULL,
	`ic_id` integer NOT NULL,
	`name` text NOT NULL,
	`specialization` text DEFAULT '' NOT NULL,
	`spec_key` text DEFAULT '' NOT NULL,
	`services` text DEFAULT '[]' NOT NULL,
	`booking_url` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doctors_ic_id_unique` ON `doctors` (`ic_id`);--> statement-breakpoint
CREATE INDEX `idx_doctors_spec` ON `doctors` (`spec_key`);--> statement-breakpoint
ALTER TABLE `contacts` ADD `ic_patient_id` integer;