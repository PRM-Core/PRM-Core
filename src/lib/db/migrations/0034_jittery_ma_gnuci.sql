CREATE TABLE `contact_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`file_name` text NOT NULL,
	`stored_name` text NOT NULL,
	`mime_type` text DEFAULT '' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`uploaded_by` text DEFAULT '' NOT NULL,
	`uploaded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_documents_contact` ON `contact_documents` (`contact_id`);