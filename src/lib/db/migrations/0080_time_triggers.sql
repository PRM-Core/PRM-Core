CREATE TABLE `engine_time_fires` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`occurrence` text NOT NULL,
	`fired_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_engine_time_fires` ON `engine_time_fires` (`automation_id`,`contact_id`,`occurrence`);