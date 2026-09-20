CREATE TABLE `contact_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`external_id` text,
	`title` text NOT NULL,
	`doctor` text DEFAULT '' NOT NULL,
	`starts_at` integer,
	`price_grosze` integer,
	`source` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_visits_external_id_unique` ON `contact_visits` (`external_id`);--> statement-breakpoint
CREATE INDEX `idx_contact_visits_contact` ON `contact_visits` (`contact_id`,`starts_at`);