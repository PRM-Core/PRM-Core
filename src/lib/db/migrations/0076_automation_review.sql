ALTER TABLE `automations` ADD `review_first` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `automations` ADD `reviewed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `engine_jobs` ADD `review` text DEFAULT '' NOT NULL;