CREATE TABLE `consent_texts` (
	`channel` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `contacts` ADD `consent_email` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` ADD `consent_sms` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` ADD `consent_profiling` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` ADD `consent_source` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` ADD `consent_updated_at` integer;--> statement-breakpoint
--> Hand-added: grant e-mail and SMS consent to every contact already in the
--> base. A deliberate decision, with the caveat that assuming a consent nobody gave is hard to
--> defend in an audit. Profiling is NOT granted: nobody asked for it, and
--> nothing depends on it.
UPDATE `contacts`
SET `consent_email` = 1,
    `consent_sms` = 1,
    `consent_source` = 'migracja',
    `consent_updated_at` = CAST(strftime('%s','now') AS INTEGER) * 1000;
--> statement-breakpoint
--> Anyone carrying the do-not-contact tag keeps no consent, whatever the bulk
--> grant above says — an explicit opt-out must survive a migration.
UPDATE `contacts`
SET `consent_email` = 0,
    `consent_sms` = 0,
    `consent_source` = 'wycofana'
WHERE lower(`tags`) LIKE '%nie-kontaktowac%';
--> statement-breakpoint
--> Starting wording, editable in Engage → Consent & RODO.
INSERT INTO `consent_texts` (`channel`, `title`, `body`, `updated_at`) VALUES
  ('email', 'Zgoda na marketing e-mail',
   'Wyrażam zgodę na otrzymywanie informacji handlowych i marketingowych na podany adres e-mail od placówki. Zgodę mogę wycofać w każdej chwili, klikając link wypisania w dowolnej wiadomości.',
   CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('sms', 'Zgoda na marketing SMS',
   'Wyrażam zgodę na otrzymywanie informacji handlowych i marketingowych w formie wiadomości SMS na podany numer telefonu. Zgodę mogę wycofać w każdej chwili.',
   CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('profiling', 'Zgoda na profilowanie i personalizację',
   'Wyrażam zgodę na przetwarzanie moich danych w celu dopasowania treści i ofert do moich potrzeb (profilowanie). Nie wpływa to na możliwość korzystania z usług placówki.',
   CAST(strftime('%s','now') AS INTEGER) * 1000);
