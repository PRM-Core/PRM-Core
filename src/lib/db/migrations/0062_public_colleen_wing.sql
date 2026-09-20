CREATE TABLE `canva_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`account_name` text DEFAULT '' NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text DEFAULT '' NOT NULL,
	`expires_at` integer DEFAULT 0 NOT NULL,
	`scopes` text DEFAULT '' NOT NULL,
	`connected_at` integer NOT NULL,
	`last_error` text,
	`last_error_at` integer
);
