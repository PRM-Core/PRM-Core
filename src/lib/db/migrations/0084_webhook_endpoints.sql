CREATE TABLE `webhook_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`url_enc` text NOT NULL,
	`secret_enc` text NOT NULL,
	`key_id` text NOT NULL,
	`fields` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
