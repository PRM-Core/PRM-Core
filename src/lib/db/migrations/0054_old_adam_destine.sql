ALTER TABLE `sms_sends` ADD `campaign_id` text;--> statement-breakpoint
CREATE INDEX `idx_sms_sends_campaign` ON `sms_sends` (`campaign_id`);