CREATE TABLE `consent_defs` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`gates` text DEFAULT '' NOT NULL,
	`builtin` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contact_consents` (
	`contact_id` text NOT NULL,
	`consent_key` text NOT NULL,
	`granted` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`contact_id`, `consent_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_contact_consents_key` ON `contact_consents` (`consent_key`,`granted`);--> statement-breakpoint
CREATE TABLE `contact_field_defs` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`type` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`hint` text DEFAULT '' NOT NULL,
	`builtin` integer DEFAULT 0 NOT NULL,
	`locked` integer DEFAULT 0 NOT NULL,
	`visible` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `contacts` ADD `custom_fields` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
--> Hand-added before the drop below: carry the edited consent wording over.
--> `consent_defs` is `consent_texts` plus everything the UI used to hardcode
--> (label, note, what the consent gates), so the clinic can add its own
--> consents instead of choosing from three the code knew about.
INSERT INTO `consent_defs`
  (`key`, `label`, `note`, `title`, `body`, `gates`, `builtin`, `active`, `sort_order`, `created_at`, `updated_at`)
SELECT `channel`,
       CASE `channel`
         WHEN 'email' THEN 'Marketing e-mail'
         WHEN 'sms' THEN 'Marketing SMS'
         ELSE 'Profilowanie'
       END,
       CASE `channel`
         WHEN 'email' THEN 'Bez niej kampanie e-mail pomijają ten kontakt.'
         WHEN 'sms' THEN 'Bez niej kampanie SMS pomijają ten kontakt.'
         ELSE 'Nie blokuje wysyłki — zgoda na dobieranie treści pod pacjenta.'
       END,
       `title`,
       `body`,
       CASE `channel` WHEN 'email' THEN 'email' WHEN 'sms' THEN 'sms' ELSE '' END,
       1,
       1,
       CASE `channel` WHEN 'email' THEN 0 WHEN 'sms' THEN 1 ELSE 2 END,
       `updated_at`,
       `updated_at`
FROM `consent_texts`;--> statement-breakpoint
--> Safety net for a base where a built-in row went missing: the contact card
--> reads its switches from this table, so a missing definition would silently
--> hide a consent that still gates sends.
INSERT OR IGNORE INTO `consent_defs`
  (`key`, `label`, `note`, `title`, `body`, `gates`, `builtin`, `active`, `sort_order`, `created_at`, `updated_at`)
VALUES
  ('email', 'Marketing e-mail', 'Bez niej kampanie e-mail pomijają ten kontakt.',
   'Zgoda na marketing e-mail',
   'Wyrażam zgodę na otrzymywanie informacji handlowych i marketingowych na podany adres e-mail. Zgodę mogę wycofać w każdej chwili, klikając link wypisania w dowolnej wiadomości.',
   'email', 1, 1, 0,
   CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('sms', 'Marketing SMS', 'Bez niej kampanie SMS pomijają ten kontakt.',
   'Zgoda na marketing SMS',
   'Wyrażam zgodę na otrzymywanie informacji handlowych i marketingowych w formie wiadomości SMS na podany numer telefonu. Zgodę mogę wycofać w każdej chwili.',
   'sms', 1, 1, 1,
   CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('profiling', 'Profilowanie', 'Nie blokuje wysyłki — zgoda na dobieranie treści pod pacjenta.',
   'Zgoda na profilowanie i personalizację',
   'Wyrażam zgodę na przetwarzanie moich danych w celu dopasowania treści i ofert do moich potrzeb (profilowanie). Nie wpływa to na możliwość korzystania z usług placówki.',
   '', 1, 1, 2,
   CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);--> statement-breakpoint
DROP TABLE `consent_texts`;