import process from "node:process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { t } from "@/lib/i18n";

/**
 * Szyfrowanie danych dostępowych zapisywanych w bazie.
 *
 * **AES-256-GCM** — szyfruje i jednocześnie wykrywa każdą zmianę zapisanego
 * ciągu. Nazwa pola (`SENDGRID_API_KEY` itd.) wchodzi jako dane uwierzytelniane:
 * zaszyfrowanej wartości nie da się przenieść do innego wiersza (np. podstawić
 * własnego adresu API pod cudzy), bo odszyfrowanie się nie powiedzie.
 *
 * **Klucz główny tylko w `.env`** (`PRM_SECRETS_KEY`, 64 znaki szesnastkowe).
 * Kopia bazy — backup z `deploy.sh`, zgubiony plik — bez niego nic nie daje.
 * Klucz główny nie trafia do bazy, logów ani przeglądarki.
 *
 * Format zapisu: `v1.<iv>.<tag>.<szyfrogram>` (base64url). Obok w wierszu leży
 * `key_id` — skrót klucza głównego. Nie zdradza klucza, a pozwala powiedzieć
 * „ten wpis zapisano innym kluczem" zamiast ogólnego „nie da się odczytać".
 */

const WERSJA = "v1";

export class CredentialCryptoError extends Error {
  constructor(
    message: string,
    public readonly reason: "key-missing" | "key-invalid" | "key-mismatch" | "corrupt",
  ) {
    super(message);
    this.name = "CredentialCryptoError";
  }
}

export interface MasterKey {
  key: Buffer;
  /** 12 znaków skrótu SHA-256 klucza — identyfikator, nie sekret. */
  id: string;
}

/** Wynik odczytu `PRM_SECRETS_KEY`: klucz, brak albo zły format. */
export type MasterKeyState =
  | { state: "ok"; master: MasterKey }
  | { state: "missing" }
  | { state: "invalid" };

export function readMasterKey(raw = process.env.PRM_SECRETS_KEY): MasterKeyState {
  const value = (raw ?? "").trim();
  if (!value) return { state: "missing" };
  if (!/^[0-9a-f]{64}$/i.test(value)) return { state: "invalid" };
  const key = Buffer.from(value, "hex");
  return { state: "ok", master: { key, id: keyId(key) } };
}

export function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

const b64 = (buf: Buffer) => buf.toString("base64url");

export function encryptCredential(plain: string, name: string, master: MasterKey): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", master.key, iv);
  cipher.setAAD(Buffer.from(name, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [WERSJA, b64(iv), b64(cipher.getAuthTag()), b64(ciphertext)].join(".");
}

export function decryptCredential(
  stored: string,
  name: string,
  storedKeyId: string,
  master: MasterKey,
): string {
  if (storedKeyId && storedKeyId !== master.id) {
    throw new CredentialCryptoError(
      t("Wpis {name} zapisano innym kluczem głównym (PRM_SECRETS_KEY).", { name: name }),
      "key-mismatch",
    );
  }
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== WERSJA) {
    throw new CredentialCryptoError(`Wpis ${name} ma nieznany format.`, "corrupt");
  }
  try {
    const [, iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", master.key, iv);
    decipher.setAAD(Buffer.from(name, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new CredentialCryptoError(
      t("Wpisu {name} nie da się odszyfrować — jest uszkodzony albo należy do innego pola.", {
        name: name,
      }),
      "corrupt",
    );
  }
}
