ALTER TABLE `contact_visits` ADD `ic_status` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `doctors` ADD `slots_capacity` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `doctors` ADD `slots_booked` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `doctors` ADD `slots_month` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `doctors` ADD `slots_synced_at` integer;