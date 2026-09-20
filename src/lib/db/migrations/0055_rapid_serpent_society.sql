CREATE TABLE `meta_connections` (
	`page_id` text PRIMARY KEY NOT NULL,
	`page_name` text DEFAULT '' NOT NULL,
	`page_access_token` text NOT NULL,
	`subscribed` integer DEFAULT 0 NOT NULL,
	`last_lead_at` integer,
	`last_error` text,
	`last_error_at` integer,
	`backfilled_to` integer,
	`connected_at` integer NOT NULL
);
