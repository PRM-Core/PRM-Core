CREATE TABLE `integration_credentials` (
	`name` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`key_id` text NOT NULL,
	`hint` text DEFAULT '' NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
