import process from "node:process";
import { getConnection, validAccessToken } from "../src/lib/canva/oauth.server";

/**
 * Co API Canvy naprawdę widzi na podłączonym koncie.
 *
 *   bun scripts/diagnostyka-canva.ts            # wszystko
 *   bun scripts/diagnostyka-canva.ts opinie     # tylko pasujące do frazy
 *
 * Powstało, gdy projekt widoczny w przeglądarce nie pojawiał się w Studiu.
 * Rozstrzyga trzy możliwości, które z zewnątrz wyglądają identycznie:
 * **inne konto**, **projekt tylko zespołowy** (nieudostępniony jawnie) oraz
 * **projekt istnieje, ale wypadł poza pobraną stronę**.
 */

const fraza = process.argv[2] ?? "";
const API = "https://api.canva.com/rest/v1";

const polaczenie = await getConnection();
if (!polaczenie) {
  console.log("Brak połączenia z Canvą — najpierw \u201ePołącz\u201d w Integracjach.");
  process.exit(1);
}

const token = await validAccessToken();
if (!token) {
  console.log(
    `Token nieważny i nie dał się odświeżyć. Ostatni błąd: ${polaczenie.lastError ?? "brak"}`,
  );
  process.exit(1);
}

async function get<T>(sciezka: string): Promise<T> {
  const res = await fetch(`${API}${sciezka}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  const tekst = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${tekst.slice(0, 300)}`);
  return JSON.parse(tekst) as T;
}

// ── 1. Czyje to konto ───────────────────────────────────────────────────────
console.log("=== podłączone konto ===");
console.log(`  nazwa w bazie:  ${polaczenie.accountName || "(brak)"}`);
console.log(`  zakresy:        ${polaczenie.scopes}`);
try {
  const me = await get<{ team_user?: { user_id?: string; team_id?: string } }>("/users/me");
  console.log(`  user_id:        ${me.team_user?.user_id ?? "(brak)"}`);
  console.log(`  team_id:        ${me.team_user?.team_id ?? "(brak)"}`);
} catch (err) {
  console.log(`  /users/me → ${err instanceof Error ? err.message : err}`);
}

// ── 2. Co zwraca lista, w rozbiciu na własne i udostępnione ─────────────────
async function policz(ownership: "any" | "owned" | "shared"): Promise<string[]> {
  const tytuly: string[] = [];
  let dalej: string | undefined;
  do {
    const p = new URLSearchParams({ ownership, limit: "100" });
    if (dalej) p.set("continuation", dalej);
    if (fraza) p.set("query", fraza);
    else p.set("sort_by", "modified_descending");
    const r = await get<{ items?: { title?: string }[]; continuation?: string }>(`/designs?${p}`);
    for (const i of r.items ?? []) tytuly.push(i.title?.trim() || "(bez nazwy)");
    dalej = r.continuation;
  } while (dalej && tytuly.length < 500);
  return tytuly;
}

console.log(`\n=== projekty${fraza ? ` pasujące do „${fraza}"` : ""} ===`);
for (const o of ["any", "owned", "shared"] as const) {
  try {
    const t = await policz(o);
    console.log(`  ownership=${o.padEnd(6)} → ${t.length}`);
    if (o === "any") for (const x of t.slice(0, 40)) console.log(`      · ${x}`);
  } catch (err) {
    console.log(`  ownership=${o.padEnd(6)} → BŁĄD: ${err instanceof Error ? err.message : err}`);
  }
}

// ── 3. Foldery — projekt może leżeć w udostępnionym folderze ────────────────
console.log(`\n=== foldery na koncie ===`);
try {
  const r = await get<{ items?: { folder?: { id?: string; name?: string } }[] }>(
    "/folders/root/items?item_types=folder",
  );
  const foldery = (r.items ?? []).map((i) => i.folder).filter(Boolean);
  if (foldery.length === 0) console.log("  (brak folderów albo brak uprawnienia folder:read)");
  for (const f of foldery) console.log(`  · ${f!.name} (${f!.id})`);
} catch (err) {
  console.log(`  BŁĄD: ${err instanceof Error ? err.message : err}`);
}

console.log(
  `\nJak to czytać:` +
    `\n  • projekt widoczny w przeglądarce, a nieobecny przy ownership=any` +
    `\n    → jest w zespole, ale NIE udostępniony jawnie temu kontu (albo to inne konto),` +
    `\n  • ownership=shared puste, a w przeglądarce widać cudze projekty` +
    `\n    → dostęp masz przez zespół, nie przez udostępnienie — API tego nie pokazuje.`,
);
