/**
 * Re-encrypts every stored secret (integration credentials, outgoing webhook
 * addresses and secrets) with the current PRM_SECRETS_KEY. The middle step
 * of the rotation in docs/KEY-ROTATION.md — runs while the application
 * serves, which reads the rest under PRM_SECRETS_KEY_PREVIOUS meanwhile.
 *
 *   PRM_SECRETS_KEY=<new> PRM_SECRETS_KEY_PREVIOUS=<old> bun scripts/rotate-secrets-key.ts          # dry run
 *   PRM_SECRETS_KEY=<new> PRM_SECRETS_KEY_PREVIOUS=<old> bun scripts/rotate-secrets-key.ts --apply  # write
 *
 * Exit code 1 when any row is under neither key — then nothing is written.
 */
import { rotateToCurrentKey } from "../src/lib/credentials/rotate.server";

const apply = process.argv.includes("--apply");
const r = await rotateToCurrentKey(apply);
console.log(
  `[rotate] under the current key: ${r.current}; ${apply ? "moved" : "to move"}: ${r.moved}`,
);
if (r.unreadable.length > 0) {
  console.error(`[rotate] under neither key (nothing written): ${r.unreadable.join(", ")}`);
  process.exit(1);
}
if (!apply && r.moved > 0) console.log("[rotate] dry run — add --apply to write.");
