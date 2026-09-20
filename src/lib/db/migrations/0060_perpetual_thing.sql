CREATE TABLE `ic_parked_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`received_at` integer NOT NULL,
	`payload` text NOT NULL,
	`processed_at` integer,
	`result` text DEFAULT '' NOT NULL
);
