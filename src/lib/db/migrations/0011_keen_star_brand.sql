CREATE TABLE `contact_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`text` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL
);
