/**
 * Wczytanie listy lekarzy i specjalistów, którą placówka dostarcza z zewnątrz.
 *
 * **Dlaczego to nie jest plik z danymi w repozytorium.** Lista lekarzy to
 * imiona, nazwiska i tytuły realnych osób — dane osobowe, które nie mają
 * czego szukać w repozytorium, a już zwłaszcza w publicznym. Leżą w pliku
 * obok bazy; kod jest tutaj.
 *
 * **Gdzie leży plik.** `doctors-seed.json` w katalogu bazy danych, czyli tam,
 * gdzie `media/` i `documents/` — `dirname(DATABASE_URL)`. Na produkcji `/data`
 * (wolumen hosta), lokalnie katalog projektu. Wzór pliku: `doctors-seed.example.json`.
 *
 * **Brak pliku nie jest błędem.** Instalacja bez arkusza z systemu rezerwacji zaczyna
 * z pustą listą i dodaje lekarzy przez interfejs. Zasiew tylko podaje pierwszy
 * stan; źródłem prawdy po zaseedowaniu jest tabela `doctors`.
 *
 * `systemId` to identyfikator lekarza w systemie rezerwacji, a `services[].id`
 * identyfikator usługi w tym samym systemie — dzięki temu wizytę da się
 * przypisać do usługi bez dopasowywania nazw. Pliki sprzed zmiany nazwy mają
 * pole `icId`; jest przyjmowane jako zamiennik.
 *
 * `specKey` to specjalizacja złożona (małe litery, bez ogonków), bo arkusze
 * potrafią mieć „Chirurg Ogólny" i „Chirurg ogólny" jako osobne wpisy, a to
 * jeden zespół. Nazwa oryginalna zostaje w `specialization` — to ona idzie
 * na ekran.
 */
import fs from "node:fs";
import path from "node:path";
import { t } from "@/lib/i18n";

export interface DoctorSeed {
  systemId: number;
  name: string;
  specialization: string;
  specKey: string;
  services: { id: number; name: string }[];
  bookingUrl: string;
}

/** Obok bazy — ta sama zasada, co `mediaDir()` w `media.server.ts`. */
export function doctorSeedPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./local.db";
  return path.join(path.dirname(url.replace(/^file:/, "")), "doctors-seed.json");
}

/**
 * Odrzuca pojedyncze wadliwe wiersze zamiast wywracać cały zasiew — arkusz
 * bywa uzupełniany ręcznie i jeden brak identyfikatora nie może kosztować pozostałych
 * siedemdziesięciu dziewięciu pozycji.
 */
function parseRow(raw: unknown): DoctorSeed | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) return null;
  const systemId = r.systemId ?? r.icId;
  if (typeof systemId !== "number" || !Number.isFinite(systemId)) return null;

  const specialization = typeof r.specialization === "string" ? r.specialization.trim() : "";
  const specKey =
    typeof r.specKey === "string" && r.specKey.trim()
      ? r.specKey.trim()
      : specialization
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/ł/g, "l");

  const services = Array.isArray(r.services)
    ? r.services.flatMap((s) => {
        if (typeof s !== "object" || s === null) return [];
        const sv = s as Record<string, unknown>;
        if (typeof sv.id !== "number" || typeof sv.name !== "string") return [];
        return [{ id: sv.id, name: sv.name }];
      })
    : [];

  return {
    systemId,
    name,
    specialization,
    specKey,
    services,
    bookingUrl: typeof r.bookingUrl === "string" ? r.bookingUrl : "",
  };
}

export function loadDoctorSeed(): DoctorSeed[] {
  const file = doctorSeedPath();
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    // Nie ma pliku — instalacja bez arkusza. Pusta lista, nie wyjątek.
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    console.error(
      t("[lekarze] {file} nie jest poprawnym JSON-em, zasiew pominięty:", { file: file }),
      error instanceof Error ? error.message : error,
    );
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.error(t("[lekarze] {file} musi zawierać tablicę, zasiew pominięty.", { file: file }));
    return [];
  }

  const rows = parsed.flatMap((r) => {
    const row = parseRow(r);
    return row ? [row] : [];
  });

  const odrzucone = parsed.length - rows.length;
  if (odrzucone > 0) {
    console.warn(
      t(
        "[lekarze] pominięto {odrzucone} z {length} pozycji w {file} — brak nazwiska lub identyfikatora.",
        {
          odrzucone: odrzucone,
          length: parsed.length,
          file: file,
        },
      ),
    );
  }
  return rows;
}
