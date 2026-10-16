ALTER TABLE `lead_webhook_settings` ADD `previous_secret` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lead_webhook_settings` ADD `previous_until` integer;