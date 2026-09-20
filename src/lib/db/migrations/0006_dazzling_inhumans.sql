CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`prm_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`pesel` text DEFAULT '' NOT NULL,
	`segments` text NOT NULL,
	`tags` text NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`medium` text DEFAULT '' NOT NULL,
	`campaign` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`status` text DEFAULT 'lead' NOT NULL
);
