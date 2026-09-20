ALTER TABLE `email_events` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `email_sends` ADD `campaign_id` text;--> statement-breakpoint
CREATE INDEX `idx_email_sends_campaign` ON `email_sends` (`campaign_id`);