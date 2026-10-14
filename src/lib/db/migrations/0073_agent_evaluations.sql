CREATE TABLE `agent_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`run_at` integer NOT NULL,
	`model` text NOT NULL,
	`total` integer NOT NULL,
	`passed` integer NOT NULL,
	`report` text NOT NULL,
	`started_by` text DEFAULT '' NOT NULL
);
