CREATE TABLE `tracking_pings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`contact_token` text,
	`url` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`referrer` text DEFAULT '' NOT NULL,
	`received_at` integer NOT NULL
);
