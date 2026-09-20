import process from "node:process";
import { timingSafeEqual } from "node:crypto";
import { getCredential } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

/**
 * Zamek na trasach MCP (`/mcp`, `/.mcp/list-tools`, `/.mcp/invoke-tool/:tool`).
 *
 * **Dlaczego.** Trasy generowane przez wtyczkę MCP są wystawione publicznie
 * i same z siebie **o nic nie pytają** — żądanie w rodzaju
 *
 *     POST https://…/.mcp/invoke-tool/list_contacts   {"limit":100}
 *
 * oddałoby kartoteki pacjentów. Zamek sprawia, że bez tokenu nie ma odpowiedzi.
 *
 * **Domyślnie MCP jest wyłączone.** Bez `PRM_MCP_TOKEN` w `.env` trasy
 * odpowiadają 404 — funkcja, z której instalacja nie korzysta, nie ma prawa być
 * otwarta. Gdy token jest ustawiony, wymagany jest
 * nagłówek `Authorization: Bearer <token>`.
 *
 * **404, nie 401.** Odpowiedź „brak uprawnień" potwierdza, że coś tu jest.
 * Skanery katalogują takie adresy i wracają do nich przy każdej nowej podatności
 * w bibliotece. Nieistniejąca trasa nie daje im nic.
 */
const NOT_FOUND = () =>
  new Response(JSON.stringify({ error: t("not found") }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Różna długość zdradza się natychmiast, więc porównanie stałoczasowe ma sens
  // dopiero przy równej — inaczej `timingSafeEqual` rzuca.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Zwraca `Response` do odesłania, gdy dostępu nie ma, albo `null`, gdy żądanie
 * może iść dalej. Taki kształt pozwala opakować cudzy handler jedną linijką.
 */
export async function mcpDenied(request: Request): Promise<Response | null> {
  const expected = (await getCredential("PRM_MCP_TOKEN")).trim();
  if (!expected) return NOT_FOUND();

  const header = request.headers.get("authorization") ?? "";
  const provided = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!provided || !tokensMatch(provided, expected)) return NOT_FOUND();

  return null;
}
