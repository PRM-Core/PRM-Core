CREATE INDEX `idx_runs_automation_contact` ON `automation_runs` (`automation_id`,`contact_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_runs_status` ON `automation_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_email_events_token` ON `email_events` (`token`);--> statement-breakpoint
CREATE INDEX `idx_email_sends_to` ON `email_sends` (`to_email`);--> statement-breakpoint
CREATE INDEX `idx_engine_events_unprocessed` ON `engine_events` (`processed_at`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_engine_jobs_due` ON `engine_jobs` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_engine_jobs_run` ON `engine_jobs` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_log_contact` ON `engine_log` (`contact_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_log_kind` ON `engine_log` (`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_log_run` ON `engine_log` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_popup_queue_contact` ON `popup_queue` (`contact_id`,`shown_at`);--> statement-breakpoint
CREATE INDEX `idx_pings_contact_token` ON `tracking_pings` (`contact_token`);