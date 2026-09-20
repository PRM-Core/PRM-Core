CREATE TABLE `popup_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_item_id` text NOT NULL,
	`name` text NOT NULL,
	`html` text NOT NULL,
	`updated_at` text NOT NULL
);
