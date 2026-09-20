CREATE TABLE `totp_recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_recovery_user` ON `totp_recovery_codes` (`user_id`,`used_at`);--> statement-breakpoint
CREATE TABLE `user_totp` (
	`user_id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`confirmed_at` integer,
	`last_used_step` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
