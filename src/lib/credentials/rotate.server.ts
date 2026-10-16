import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { integrationCredentials, webhookEndpoints } from "../db/schema";
import { decryptCredential, encryptCredential, masterFor, readMasterKey } from "./crypto.server";

// Moving every stored secret to the current PRM_SECRETS_KEY — the middle step
// of a key rotation (docs/KEY-ROTATION.md). The application already reads
// rows under PRM_SECRETS_KEY_PREVIOUS, so this runs while it serves; each row
// is decrypted and checked before it is rewritten, and nothing is written
// unless every row can be moved.

export interface RotationReport {
  /** Rows already under the current key. */
  current: number;
  /** Rows that move (or moved, with apply) to the current key. */
  moved: number;
  /** Rows under neither key — they would be lost; nothing is written while any exist. */
  unreadable: string[];
  applied: boolean;
}

export async function rotateToCurrentKey(apply: boolean): Promise<RotationReport> {
  const state = readMasterKey();
  if (state.state !== "ok") throw new Error("PRM_SECRETS_KEY is missing or not 64 hex characters.");
  const m = state.master;
  const db = getDb();
  const report: RotationReport = { current: 0, moved: 0, unreadable: [], applied: false };
  const writes: (() => Promise<unknown>)[] = [];

  for (const row of await db.select().from(integrationCredentials)) {
    if (row.keyId === m.id) {
      report.current += 1;
      continue;
    }
    const old = masterFor(row.keyId);
    if (!old) {
      report.unreadable.push(`credential ${row.name}`);
      continue;
    }
    const plain = decryptCredential(row.ciphertext, row.name, row.keyId, old);
    const ciphertext = encryptCredential(plain, row.name, m);
    report.moved += 1;
    writes.push(() =>
      db
        .update(integrationCredentials)
        .set({ ciphertext, keyId: m.id })
        .where(eq(integrationCredentials.name, row.name)),
    );
  }

  for (const row of await db.select().from(webhookEndpoints)) {
    if (row.keyId === m.id) {
      report.current += 1;
      continue;
    }
    const old = masterFor(row.keyId);
    if (!old) {
      report.unreadable.push(`webhook ${row.name}`);
      continue;
    }
    const urlName = `webhook:${row.id}:url`;
    const secretName = `webhook:${row.id}:secret`;
    const urlEnc = encryptCredential(
      decryptCredential(row.urlEnc, urlName, row.keyId, old),
      urlName,
      m,
    );
    const secretEnc = encryptCredential(
      decryptCredential(row.secretEnc, secretName, row.keyId, old),
      secretName,
      m,
    );
    report.moved += 1;
    writes.push(() =>
      db
        .update(webhookEndpoints)
        .set({ urlEnc, secretEnc, keyId: m.id })
        .where(eq(webhookEndpoints.id, row.id)),
    );
  }

  if (apply && report.unreadable.length === 0) {
    for (const write of writes) await write();
    report.applied = true;
  }
  return report;
}
