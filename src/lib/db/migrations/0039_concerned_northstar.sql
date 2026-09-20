CREATE TABLE `popup_events` (
	`id` text PRIMARY KEY NOT NULL,
	`settings_id` integer,
	`content_item_id` text NOT NULL,
	`kind` text NOT NULL,
	`visitor_id` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_popup_events_item` ON `popup_events` (`content_item_id`,`created_at`);