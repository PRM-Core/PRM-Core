# Outgoing webhooks

The automation step **Send to a webhook** posts one patient to a system you
run or use — n8n, Make, Zapier, or your own service. It is the one step that
sends patient data out of the installation, so what may leave, and where to,
is decided by an administrator, not in the automation.

## Setting up a destination

Automations → PRM Engine → **Outgoing webhooks** (administrators only):

- **Name**, the label automation editors pick in the step.
- **Address.** HTTPS anywhere. Plain HTTP is accepted only for an address
  inside the clinic's network (loopback or a private range), where n8n often
  runs. No login or password in the address; the signature does that job.
  The address is stored encrypted with `PRM_SECRETS_KEY`, because a Zapier or
  Make hook URL is itself a secret. The screen shows only the host.
- **Fields allowed out.** The PRM number always goes. First name, last name,
  e-mail, phone, status, tags, segments, source, campaign and the date added
  go only when ticked. A PESEL and custom fields never go: custom fields
  can hold anything, including medical information.
- **Secret.** Generated when the destination is created, and shown once to
  paste into the receiver. **New secret** replaces it; the old one stops
  verifying at once.

The receiver processes patient data on the clinic's behalf, so a data
processing agreement is needed, as for any processor.

`PRM_SECRETS_KEY` must be set in `.env`. Without it, destinations cannot be
saved.

## What is sent

```http
POST <address>
Content-Type: application/json
User-Agent: PRM-Core-Webhook
X-PRM-Timestamp: 1792072800000
X-PRM-Signature: sha256=<hex>
```

```json
{
  "event": "automation.step",
  "sentAt": "2026-10-15T08:00:00.000Z",
  "automation": { "id": "…", "name": "Invitation to a check-up" },
  "run": "…",
  "step": "…",
  "contact": { "prmId": "PRM-00042", "firstName": "Anna" }
}
```

`contact` holds the PRM number and only the fields allowed for this
destination.

## Verifying the signature

`X-PRM-Signature` is `sha256=` followed by the hex HMAC-SHA256 of the string
`<X-PRM-Timestamp>.<raw body>`, keyed with the destination's secret.
Compute it over the raw body exactly as received, before parsing it. Reject a
request whose timestamp is more than a few minutes old: the timestamp is
inside the signature, so a captured request cannot be replayed later.

Node.js:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, timestamp, rawBody, signature) {
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const fresh = Math.abs(Date.now() - Number(timestamp)) < 5 * 60_000;
  return (
    fresh &&
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}
```

In n8n, a Webhook node followed by a Crypto node (HMAC, SHA256, hex) over
`{{$json.headers["x-prm-timestamp"]}}.{{JSON.stringify($json.body)}}`
works when the body is passed through unchanged. If in doubt, enable the raw
body option and sign that.

## Delivery

One attempt, with a 10-second timeout. A redirect is not followed: it could
send the data to an address the administrator never approved. A 2xx answer
is success. A timeout, a redirect or any other status is an error: the run
stops at this step, and the engine log says why. Retrying is a decision for
the automation, not a silent loop. The dry run ("Test on a contact") only
says where the data would go and which fields; it sends nothing.
