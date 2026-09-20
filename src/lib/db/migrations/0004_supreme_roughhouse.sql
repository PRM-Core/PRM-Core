CREATE TABLE `email_events` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`kind` text NOT NULL,
	`url` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`token`) REFERENCES `email_sends`(`token`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_sends` (
	`token` text PRIMARY KEY NOT NULL,
	`to_email` text NOT NULL,
	`subject` text NOT NULL,
	`content_item_id` text,
	`sent_at` integer NOT NULL
);
