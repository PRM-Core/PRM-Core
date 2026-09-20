/**
 * Sprawdza granicę: produkt (GitHub) ↔ instalacja (jedna placówka).
 *
 *   bun run sprawdz:rozdzial   — to, co trafiłoby do następnego commita
 *   bun run sprawdz:historia   — dodatkowo KAŻDY commit w historii
 *
 * **Uruchom `sprawdz:historia` przed pierwszym wypchnięciem na GitHuba.**
 * Publikuje się całą historię, a nie tylko ostatni stan: plik usunięty
 * kolejnym commitem nadal leży w starszym i każdy może go odczytać.
 *
 * Co sprawdzamy:
 *
 * 1. **Każdy plik instalacji ma wzór** (`.env` → `.env.example` itd.). Brak
 *    wzoru znaczy, że świeży klon nie wystartuje.
 * 2. **Pliki instalacji nie są w repozytorium** — niezależnie od `.gitignore`.
 *    Gdyby wpis stamtąd zniknął, plik wyszedłby tutaj jako błąd.
 * 3. **Nic, co idzie do repozytorium, nie zawiera danych placówki ani osób**:
 *    nazw, domen, adresu serwera, kształtów kluczy API i numerów PESEL
 *    z poprawną sumą kontrolną.
 *
 * Sprawdza wszystkie pliki (także `.sql`), numery PESEL z poprawną sumą
 * kontrolną i — na żądanie — całą historię commitów.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { peselInfo } from "../src/lib/pesel";

const HISTORIA = process.argv.includes("--historia");
/**
 * `--galaz=nazwa` zawęża historię do commitów osiągalnych z jednej gałęzi —
 * tej, która faktycznie idzie na GitHuba. Bez tego sprawdzane są wszystkie
 * gałęzie (`--all`), także lokalne, które nigdy nie zostaną wypchnięte.
 */
const GALAZ = process.argv.find((a) => a.startsWith("--galaz="))?.slice("--galaz=".length);
const ZAKRES = GALAZ ? [GALAZ] : ["--all"];

/** Pliki jednej instalacji i ich wzory. Rozszerzasz `.gitignore`? Dopisz i tu. */
const INSTALACJA: { plik: string; wzor: string | null }[] = [
  { plik: ".env", wzor: ".env.example" },
  { plik: "Caddyfile", wzor: "Caddyfile.example" },
  { plik: "docker-compose.override.yml", wzor: "docker-compose.override.example.yml" },
  { plik: "doctors-seed.json", wzor: "doctors-seed.example.json" },
  { plik: "NOTES.md", wzor: null },
  { plik: "PLAN-WDROZEN.md", wzor: null },
  { plik: "PUBLIKACJA-GITHUB.md", wzor: null },
  { plik: "granica.local.json", wzor: "granica.local.example.json" },
];

/** Ścieżki, które nigdy nie mogą znaleźć się w repozytorium. */
const ZAKAZANE_SCIEZKI: RegExp[] = [
  /^\.env$/,
  /^Caddyfile$/,
  /^docker-compose\.override\.yml$/,
  /^doctors-seed\.json$/,
  /^NOTES\.md$/,
  /^PLAN-WDROZEN\.md$/,
  /^PUBLIKACJA-GITHUB\.(md|sh)$/,
  /^granica\.local\.json$/,
  /^WDROZENIE-.*\.md$/,
  /\.db(-journal|-wal|-shm)?$/,
  /^(data|media|documents|logs)\//,
  /^\.lovable\//,
  /^\.claude\//,
  // Dawny plik z listą lekarzy w kodzie — lista należy do instalacji.
  /^src\/lib\/ic\/doctors-seed\.ts$/,
];

interface Marker {
  nazwa: string;
  /** Wzorzec dla `git grep -E` i dla JS — dlatego bez konstrukcji spoza ERE. */
  wzorzec: string;
  wielkoscLiter: boolean;
  /** Wartość kluczy nie jest wypisywana. */
  tajny: boolean;
  dozwoloneW: string[];
}

/**
 * Wzorce ogólne — takie same dla każdej instalacji, więc mogą być publiczne.
 */
const MARKERY_OGOLNE: Marker[] = [
  {
    nazwa: "klucz SendGrid",
    wzorzec: "SG\\.[A-Za-z0-9_-]{20,}",
    wielkoscLiter: true,
    tajny: true,
    dozwoloneW: [],
  },
  {
    nazwa: "klucz Anthropic",
    wzorzec: "sk-ant-[A-Za-z0-9_-]{20,}",
    wielkoscLiter: true,
    tajny: true,
    dozwoloneW: [],
  },
  {
    nazwa: "klucz OpenAI",
    wzorzec: "sk-proj-[A-Za-z0-9_-]{20,}",
    wielkoscLiter: true,
    tajny: true,
    dozwoloneW: [],
  },
  {
    nazwa: "klucz Google",
    wzorzec: "AIza[0-9A-Za-z_-]{35}",
    wielkoscLiter: true,
    tajny: true,
    dozwoloneW: [],
  },
  {
    nazwa: "Twilio SID",
    wzorzec: "AC[0-9a-f]{32}",
    wielkoscLiter: true,
    tajny: true,
    dozwoloneW: [],
  },
  {
    nazwa: "klucz prywatny",
    wzorzec: "-----BEGIN [A-Z ]*PRIVATE KEY-----",
    wielkoscLiter: true,
    tajny: true,
    dozwoloneW: [],
  },
];

/**
 * Wzorce **tej instalacji** — nazwa placówki, domeny, adres serwera, prywatne
 * adresy e-mail — z lokalnego pliku `granica.local.json` (poza gitem).
 *
 * **Dlaczego nie tutaj.** Ten skrypt jest publiczny. Lista tego, czego nie wolno
 * opublikować, wpisana w jego kod, sama byłaby publikacją: nazwy klienta,
 * domeny i adresu serwera. Wcześniejsza wersja tak robiła i przechodziła własną
 * kontrolę tylko dlatego, że wzorce zapisane z ukośnikiem nie dopasowywały
 * same siebie. Wzór pliku: `granica.local.example.json`.
 */
function markeryInstalacji(): Marker[] {
  const plik = path.join(process.cwd(), "granica.local.json");
  if (!fs.existsSync(plik)) return [];
  const dane = JSON.parse(fs.readFileSync(plik, "utf8")) as Partial<Marker>[];
  return dane.map((m) => ({
    nazwa: String(m.nazwa ?? "dane instalacji"),
    wzorzec: String(m.wzorzec),
    wielkoscLiter: m.wielkoscLiter === true,
    tajny: m.tajny === true,
    dozwoloneW: Array.isArray(m.dozwoloneW) ? m.dozwoloneW.map(String) : [],
  }));
}

const MARKERY_LOKALNE = markeryInstalacji();
const MARKERY: Marker[] = [...MARKERY_OGOLNE, ...MARKERY_LOKALNE];

/** Plik blokady zależności: tysiące skrótów, zero treści placówki. */
const POMIJANE_PRZY_TRESCI = new Set(["bun.lock"]);

// ── narzędzia ──────────────────────────────────────────────────────────────

function git(args: string[], opts: { allowFail?: boolean } = {}): string {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`git ${args.join(" ")} — ${r.stderr.trim()}`);
  }
  return r.stdout;
}

function czyRepo(): boolean {
  return (
    spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" }).status === 0
  );
}

function dozwolone(marker: Marker, plik: string): boolean {
  return marker.dozwoloneW.includes(plik);
}

/**
 * Ciąg 11 cyfr, który jest **prawdziwie wyglądającym PESEL-em**: poprawna suma
 * kontrolna i data urodzenia dająca wiek 0–120 lat. Numer z błędną sumą albo
 * niemożliwą datą nie może należeć do nikogo i nie jest zgłaszany.
 */
function peseleWLinii(linia: string): string[] {
  const out: string[] = [];
  for (const m of linia.matchAll(/(?<![0-9+])[0-9]{11}(?![0-9])/g)) {
    if (peselInfo(m[0])) out.push(m[0]);
  }
  return out;
}

function ukryj(tekst: string, marker: Marker | "pesel"): string {
  if (marker === "pesel") return "(numer ukryty)";
  return marker.tajny ? "(wartość ukryta)" : tekst.trim().slice(0, 100);
}

function wyglądaNaBinarny(bufor: Buffer): boolean {
  return bufor.subarray(0, 8000).includes(0);
}

let bledy = 0;
const zglos = (tekst: string) => {
  console.error(`  ${tekst}`);
  bledy++;
};

// ── 1. wzory ────────────────────────────────────────────────────────────────

const korzen = process.cwd();
console.log(
  MARKERY_LOKALNE.length > 0
    ? `Wzorce: ${MARKERY_OGOLNE.length} ogólnych + ${MARKERY_LOKALNE.length} tej instalacji (granica.local.json)\n`
    : `Wzorce: ${MARKERY_OGOLNE.length} ogólnych. Brak granica.local.json — nazwy placówki, domeny i adresy\n` +
        "        tej instalacji NIE są sprawdzane. Przed publikacją uruchom lokalnie, z tym plikiem.\n",
);
console.log("── 1. Czy każdy plik instalacji ma wzór ──────────────────────\n");
for (const { plik, wzor } of INSTALACJA) {
  if (!wzor) {
    console.log(`  ${plik.padEnd(34)} wzór niepotrzebny`);
    continue;
  }
  if (fs.existsSync(path.join(korzen, wzor))) console.log(`  ${plik.padEnd(34)} wzór: ${wzor}`);
  else zglos(`${plik.padEnd(34)} BRAK WZORU (${wzor}) — świeży klon nie wystartuje`);
}

// ── 2–3. to, co trafiłoby do następnego commita ──────────────────────────────

const repo = czyRepo();
const doCommita: string[] = repo
  ? git(["ls-files", "--cached", "--others", "--exclude-standard"])
      .split("\n")
      .filter((p) => p && fs.existsSync(path.join(korzen, p)))
  : [];

console.log("\n── 2. Czy pliki instalacji są poza repozytorium ──────────────\n");
if (!repo) {
  console.log("  (to nie jest repozytorium git — pomijam)");
} else {
  const zakazane = doCommita.filter((p) => ZAKAZANE_SCIEZKI.some((r) => r.test(p)));
  if (zakazane.length === 0)
    console.log(`  ${doCommita.length} plików do commita — żaden nie jest plikiem instalacji.`);
  for (const p of zakazane) zglos(`${p} — plik instalacji trafiłby do repozytorium`);
}

console.log("\n── 3. Czy do repozytorium nie idą dane placówki ani osób ─────\n");
let znalezione = 0;
for (const plik of doCommita) {
  if (POMIJANE_PRZY_TRESCI.has(plik)) continue;
  const bufor = fs.readFileSync(path.join(korzen, plik));
  if (wyglądaNaBinarny(bufor)) continue;
  const linie = bufor.toString("utf8").split("\n");
  linie.forEach((linia, i) => {
    for (const m of MARKERY) {
      if (dozwolone(m, plik)) continue;
      if (new RegExp(m.wzorzec, m.wielkoscLiter ? "" : "i").test(linia)) {
        zglos(`${plik}:${i + 1}  [${m.nazwa}]  ${ukryj(linia, m)}`);
        znalezione++;
      }
    }
    if (peseleWLinii(linia).length > 0) {
      zglos(`${plik}:${i + 1}  [PESEL z poprawną sumą kontrolną]  ${ukryj(linia, "pesel")}`);
      znalezione++;
    }
  });
}
if (repo && znalezione === 0) console.log(`  Przejrzano ${doCommita.length} plików — czysto.`);

// ── 4. historia ─────────────────────────────────────────────────────────────

if (HISTORIA) {
  console.log("\n── 4. Historia: każdy commit ─────────────────────────────────\n");
  if (!repo) {
    zglos("--historia wymaga repozytorium git");
  } else {
    const commity = git(["rev-list", ...ZAKRES])
      .split("\n")
      .filter(Boolean);
    console.log(
      `  Commitów: ${commity.length}${GALAZ ? ` (gałąź ${GALAZ})` : " (wszystkie gałęzie)"}`,
    );

    // 4a. pliki instalacji kiedykolwiek w historii
    const wszystkieSciezki = new Set(
      git(["log", ...ZAKRES, "--format=", "--name-only"])
        .split("\n")
        .filter(Boolean),
    );
    const zakazaneWHistorii = [...wszystkieSciezki].filter((p) =>
      ZAKAZANE_SCIEZKI.some((r) => r.test(p)),
    );
    for (const p of zakazaneWHistorii)
      zglos(`historia: ${p} — plik instalacji był w którymś commicie`);

    // 4b. treść plików we wszystkich commitach
    const widziane = new Set<string>();
    const zapiszTrafienie = (
      sha: string,
      plik: string,
      nr: string,
      opis: string,
      wiersz: string,
    ) => {
      // Ten sam wiersz powtarza się w kolejnych commitach (pod innym numerem
      // linii, gdy plik rośnie) — kluczem jest więc treść, nie numer. Opis
      // nie wystarcza: przy ukrytych wartościach jest identyczny dla różnych
      // trafień i sklejałby trzy PESEL-e w jeden.
      const klucz = `${plik}\u0000${wiersz.trim()}`;
      if (widziane.has(klucz)) return;
      widziane.add(klucz);
      zglos(`historia ${sha.slice(0, 7)} ${plik}:${nr}  ${opis}`);
    };
    for (const m of MARKERY) {
      const args = [
        "grep",
        "-I",
        "-n",
        "-E",
        ...(m.wielkoscLiter ? [] : ["-i"]),
        m.wzorzec,
        ...commity,
        "--",
      ];
      const wynik = git(args, { allowFail: true });
      for (const wiersz of wynik.split("\n").filter(Boolean)) {
        const [sha, plik, nr, ...reszta] = wiersz.split(":");
        if (POMIJANE_PRZY_TRESCI.has(plik) || dozwolone(m, plik)) continue;
        zapiszTrafienie(
          sha,
          plik,
          nr,
          `[${m.nazwa}]  ${ukryj(reszta.join(":"), m)}`,
          reszta.join(":"),
        );
      }
    }
    const kandydaci = git(["grep", "-I", "-n", "-E", "[0-9]{11}", ...commity, "--"], {
      allowFail: true,
    });
    for (const wiersz of kandydaci.split("\n").filter(Boolean)) {
      const [sha, plik, nr, ...reszta] = wiersz.split(":");
      if (POMIJANE_PRZY_TRESCI.has(plik)) continue;
      if (peseleWLinii(reszta.join(":")).length > 0) {
        zapiszTrafienie(
          sha,
          plik,
          nr,
          "[PESEL z poprawną sumą kontrolną]  (numer ukryty)",
          reszta.join(":"),
        );
      }
    }

    // 4c. wiadomości commitów
    const wiadomosci = git(["log", ...ZAKRES, "--format=%h%x1f%B%x1e"]);
    for (const rekord of wiadomosci.split("\x1e").filter((r) => r.trim())) {
      const [sha, tresc] = rekord.trim().split("\x1f");
      for (const m of MARKERY) {
        if (new RegExp(m.wzorzec, m.wielkoscLiter ? "" : "i").test(tresc)) {
          zglos(`historia ${sha} wiadomość commita  [${m.nazwa}]`);
        }
      }
      if (peseleWLinii(tresc).length > 0) zglos(`historia ${sha} wiadomość commita  [PESEL]`);
    }

    // 4d. tożsamości autorów i commiterów — publiczne po wypchnięciu
    const tozsamosci = new Map<string, number>();
    for (const t of git(["log", ...ZAKRES, "--format=%an <%ae>%n%cn <%ce>"])
      .split("\n")
      .filter(Boolean)) {
      tozsamosci.set(t, (tozsamosci.get(t) ?? 0) + 1);
    }
    console.log("\n  Autorzy i commiterzy (po wypchnięciu widoczni publicznie):");
    for (const [t, n] of tozsamosci) {
      // Tylko adres: imię i nazwisko autora to świadomy wybór, adres prywatny — wyciek.
      const adres = t.match(/<([^>]*)>$/)?.[1] ?? "";
      // Adres prywatności GitHuba (`…@users.noreply.github.com`) zawiera login
      // konta, a login jest publiczny przy każdym wypchnięciu. To jest ten
      // adres, który ma być w commitach — nie wyciek, nawet gdy login zawiera
      // czyjeś nazwisko.
      const noreplyGitHuba = /@users\.noreply\.github\.com$/i.test(adres);
      const prywatny =
        !noreplyGitHuba && MARKERY.some((m) => new RegExp(m.wzorzec, "i").test(adres));
      const zastepczy = /@local>$|<test@/i.test(t);
      console.log(
        `    ${n.toString().padStart(3)}×  ${t}${prywatny ? "  ← prywatny adres" : zastepczy ? "  ← tożsamość testowa" : ""}`,
      );
      if (prywatny) zglos(`historia: tożsamość z prywatnym adresem: ${t}`);
      if (zastepczy) zglos(`historia: tożsamość testowa zamiast prawdziwej: ${t}`);
    }
  }
}

console.log("");
if (bledy > 0) {
  console.error(`NIE PUBLIKUJ: ${bledy} ${bledy === 1 ? "problem" : "problemów"} do naprawienia.`);
  process.exit(1);
}
console.log(
  HISTORIA
    ? "Granica trzyma — także w historii. Można publikować."
    : "Granica trzyma — można publikować.",
);
