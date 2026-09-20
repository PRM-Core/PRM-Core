CREATE TABLE `sms_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`to_phone` text NOT NULL,
	`sender` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`source` text DEFAULT 'automation' NOT NULL,
	`automation_id` text,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sms_sends_contact` ON `sms_sends` (`contact_id`);--> statement-breakpoint
ALTER TABLE `contacts` ADD `phone_only` integer DEFAULT 0 NOT NULL;