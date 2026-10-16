# Rotating keys and secrets

Two kinds of secret can be rotated without taking the application down: the
master key that encrypts stored credentials, and the secret senders put in
the `X-Webhook-Secret` header. Each section says when to rotate, and the
steps in order.

## The master key — `PRM_SECRETS_KEY`

`PRM_SECRETS_KEY` encrypts what is stored in the database: integration
credentials saved in the panel (SendGrid, Twilio, …) and outgoing webhook
addresses and secrets. Every stored value records which key encrypted it.

Rotate it when the key may have leaked: a copy of `.env` in the wrong place,
a person with access leaving. Also rotate it on a schedule you choose. Keep
the old key until step 4.

1. **Make a new key** and keep both:

   ```bash
   head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
   ```

2. **Run with both keys.** In `.env`, set the new key as `PRM_SECRETS_KEY`
   and the old one as `PRM_SECRETS_KEY_PREVIOUS`, then restart. The
   application now writes with the new key and still reads values stored
   under the old one, so nothing stops working.

3. **Move the stored values to the new key**, while the application runs.
   First a dry run, which writes nothing and says how many values will move:

   ```bash
   bun run secrets:rotate
   ```

   Then the move itself:

   ```bash
   bun run secrets:rotate -- --apply
   ```

   In Docker, run the same command inside the container, which has `.env`
   and the database. Each value is decrypted and checked before it is
   rewritten. If any value is under neither key, the script names it, exits
   with code 1 and writes nothing. Re-enter that credential in the panel,
   then run it again. A second run reports nothing left to move.

4. **Drop the old key.** Remove `PRM_SECRETS_KEY_PREVIOUS` from `.env`,
   restart, and destroy the old key with every copy of it.

Back up the new key separately from database backups, as before. A database
backup without the key reveals no credentials. A backup taken before step 3
needs the old key to be read.

## The incoming webhook secret — `X-Webhook-Secret`

The booking system and the lead sources (n8n, Make, Zapier, your forms) send
this secret with every request. It is shown and rotated under Integrations →
Contact and booking webhook. The rotation offers two choices:

- **Planned rotation**: the old secret keeps working for 24 hours. Put the
  new one into each sender within that time. Every request that still uses
  the old secret writes a line to the log, so you can see which sender is
  left. After 24 hours the old secret is refused.
- **Leak**: the old secret stops at once. Senders are refused until they
  have the new one; that is the point.

Both compare secrets in constant time, so response times reveal nothing
about a guess.

## Outgoing webhook secrets

Each destination under PRM Engine → Outgoing webhooks has its own signing
secret. **New secret** replaces it at once and shows the new one once. Put
it into the receiver straight after: requests signed with the new secret do
not verify against the old one. A destination that cannot be updated
quickly is better rotated at a quiet hour.
