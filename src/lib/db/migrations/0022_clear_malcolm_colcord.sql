CREATE TABLE `sms_senders` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`value` text NOT NULL,
	`kind` text NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sms_senders_value_unique` ON `sms_senders` (`value`);--> statement-breakpoint
--> Hand-added before the drop below: carry the single configured sender over
--> as the default one, otherwise dropping the column would silently lose it.
--> A value starting with "+" or a digit is a real number; anything else
--> (e.g. "KlinikaABC") is a branded alphanumeric sender.
INSERT INTO `sms_senders` (`id`, `label`, `value`, `kind`, `is_default`, `created_at`)
SELECT lower(hex(randomblob(16))),
       'Nadawca domyślny',
       `from_number`,
       CASE WHEN `from_number` GLOB '[+0-9]*' THEN 'number' ELSE 'alphanumeric' END,
       1,
       CAST(strftime('%s','now') AS INTEGER) * 1000
FROM `sms_settings`
WHERE trim(`from_number`) <> '';--> statement-breakpoint
ALTER TABLE `sms_settings` DROP COLUMN `from_number`;