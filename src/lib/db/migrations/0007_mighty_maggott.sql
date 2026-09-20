CREATE TABLE `sms_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_number` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
