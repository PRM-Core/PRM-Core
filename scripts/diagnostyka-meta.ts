import process from "node:process";
import { desc, sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client.server";
import { contactNotes, contacts, engineLog, metaConnections } from "../src/lib/db/schema";

/**
 * Stan napływu leadów z Facebooka — odczyt, niczego nie zmienia.
 *
 *   bun scripts/diagnostyka-meta.ts        # 5 ostatnich leadów
 *   bun scripts/diagnostyka-meta.ts 15
 *
 * Odpowiada na jedno pytanie: **czy leady wpadają**. Rozdziela przy tym trzy
 * rzeczy, które z zewnątrz wyglądają identycznie (cisza w kartotece):
 * brak podłączonej strony, brak zgłoszeń od Mety i zgłoszenia odrzucone
 * u nas — każde ma inną naprawę.
 */

const ile = Number(process.argv[2] ?? 5);
const db = getDb();
const doba = Date.now() - 86_400_000;
const tydzien = Date.now() - 7 * 86_400_000;

function dt(x: unknown): string {
  if (!x) return "—";
  const d = typeof x === "number" ? new Date(x) : new Date(String(x));
  return isNaN(d.getTime()) ? String(x) : d.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
}

// ── 1. Czy w ogóle jest co odbierać ─────────────────────────────────────────
const strony = await db.select().from(metaConnections);
console.log(`=== podłączone strony Facebooka: ${strony.length} ===`);
for (const s of strony) {
  console.log(
    `  ${s.pageName} (id ${s.pageId})` +
      `  tagi: ${(s.leadTags ?? []).join(", ") || "(brak)"}` +
      `  status: ${s.leadStatus || "(pusty)"}`,
  );
}
if (strony.length === 0) {
  console.log("  Nie ma żadnej podłączonej strony — leady nie mają skąd przychodzić.");
}

// ── 2. Ile leadów przyszło ──────────────────────────────────────────────────
const licz = async (warunek: ReturnType<typeof sql>) =>
  (
    await db
      .select({ n: sql<number>`count(*)` })
      .from(contacts)
      .where(warunek)
  )[0].n;

const zrodloMeta = sql`(lower(source) like '%meta%' or lower(source) like '%facebook%' or lower(medium) like '%paid_social%')`;
console.log(`\n=== leady z Facebooka ===`);
console.log(`  łącznie w bazie:     ${await licz(zrodloMeta)}`);
console.log(
  `  z ostatnich 7 dni:   ${await licz(sql`${zrodloMeta} and created_at >= ${new Date(tydzien).toISOString()}`)}`,
);
console.log(
  `  z ostatniej doby:    ${await licz(sql`${zrodloMeta} and created_at >= ${new Date(doba).toISOString()}`)}`,
);

const ostatnie = await db
  .select()
  .from(contacts)
  .where(zrodloMeta)
  .orderBy(desc(contacts.createdAt))
  .limit(ile);

for (const c of ostatnie) {
  const notatki = await db
    .select()
    .from(contactNotes)
    .where(sql`contact_id = ${c.id}`);
  console.log(`\n  ${c.firstName} ${c.lastName} (${c.prmId})  dodany ${dt(c.createdAt)}`);
  console.log(`    kontakt:  ${c.email || "brak e-maila"} / ${c.phone || "brak telefonu"}`);
  console.log(`    kampania: ${c.campaign || "(brak)"}`);
  console.log(
    `    tagi:     ${(c.tags ?? []).join(", ") || "(brak)"}   status: ${c.status || "(pusty)"}`,
  );
  console.log(
    `    notatki:  ${notatki.length}${notatki[0] ? " — " + String(notatki[0].text).split("\n")[0].slice(0, 70) : ""}`,
  );
}

// ── 3. Co mówi dziennik ─────────────────────────────────────────────────────
console.log(`\n=== ostatnie wpisy dotyczące Mety ===`);
const wpisy = await db
  .select()
  .from(engineLog)
  .where(sql`message like '%Meta%' or message like '%lead%' or message like '%Lead%'`)
  .orderBy(desc(engineLog.createdAt))
  .limit(8);

if (wpisy.length === 0) {
  console.log(
    "  (brak wpisów — od ostatniego restartu nic nie przyszło i nic nie było dopytywane)",
  );
}
for (const w of wpisy) {
  console.log(`  ${dt(w.createdAt)}  [${w.kind}] ${w.message.slice(0, 150)}`);
}

console.log(
  `\nUwaga: wstrzymanie wymiany z systemem rezerwacji (Integracje) **nie dotyczy** leadów` +
    `\nz Facebooka — to osobna ścieżka i działa niezależnie.`,
);
