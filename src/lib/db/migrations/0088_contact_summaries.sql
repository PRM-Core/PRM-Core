CREATE TABLE `contact_summaries` (
	`contact_id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`fingerprint` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'card' NOT NULL,
	`tokens_in` integer,
	`tokens_out` integer,
	`created_at` integer NOT NULL
);
