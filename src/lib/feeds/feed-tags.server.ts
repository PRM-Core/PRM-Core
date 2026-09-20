import { findFeedRow } from "./feeds.server";
import type { Contact } from "../contacts";
import { t } from "@/lib/i18n";

/**
 * Pola dynamiczne z feedu w treści wiadomości.
 *
 * **Składnia**: `%%FEED:nazwa|pole_kontaktu|kolumna%%`
 *   `%%FEED:Lekarze|custom_lekarz|Link do opinii%%`
 *
 * Czyta się to jako: *w feedzie „Lekarze" znajdź wiersz pasujący do pola
 * `custom_lekarz` tego pacjenta i wstaw kolumnę „Link do opinii"*.
 *
 * **Dlaczego taka postać, a nie ładniejsza.** Znacznik przechodzi przez edytor
 * treści, zapis do bazy, migawkę i wysyłkę — po drodze bywa escapowany
 * i przepisywany. `%%…%%` przeżywa to samo, co `%%PRM_UNSUBSCRIBE%%`, który
 * działa od początku, więc nie wymyślam drugiego mechanizmu obok sprawdzonego.
 * Człowiek i tak nie wpisuje tego ręcznie — wstawia z listy w edytorze.
 *
 * **Rozwijane przy wysyłce, per odbiorca** — tak jak znaczniki personalizacji.
 * Rozwinięcie przy zapisie treści dałoby jedną wartość dla wszystkich.
 */

const FEED_TAG = /%%FEED:([^|%]+)\|([^|%]+)\|([^%]+)%%/g;

/** Wartość pola kontaktu — wbudowanego albo własnego. */
function contactValue(contact: Contact, field: string): string {
  if (field.startsWith("custom_")) return contact.customFields?.[field] ?? "";
  const raw = (contact as unknown as Record<string, unknown>)[field];
  return raw === undefined || raw === null ? "" : String(raw);
}

export interface FeedResolveResult {
  html: string;
  /** Znaczniki, dla których nie znaleziono wiersza — do zgłoszenia, nie do przemilczenia. */
  misses: string[];
}

/**
 * Podstawia dane z feedów w treści jednej wiadomości.
 *
 * **Nietrafiony znacznik znika z treści, ale wraca w `misses`.** Zostawienie
 * `%%FEED:…%%` w wysłanej wiadomości byłoby gorsze — pacjent zobaczyłby surowy
 * kod. Ale ciche usunięcie bez śladu znaczyłoby, że nikt się nie dowie
 * o pustym linku; stąd druga połowa wyniku.
 */
export async function resolveFeedTags(html: string, contact: Contact): Promise<FeedResolveResult> {
  const misses: string[] = [];
  const matches = [...html.matchAll(FEED_TAG)];
  if (matches.length === 0) return { html, misses };

  // Jeden odczyt na parę (feed, wartość) — wiadomość zwykle bierze kilka kolumn
  // z tego samego wiersza (link, zdjęcie, nazwisko), a każde osobno oznaczałoby
  // kilka zapytań o dokładnie ten sam wiersz.
  const cache = new Map<string, Record<string, string> | null>();
  let out = html;

  for (const m of matches) {
    const [whole, feedName, contactField, column] = m.map((x) => (x ?? "").trim());
    const lookup = contactValue(contact, contactField);
    if (!lookup) {
      misses.push(
        t('{feedName}: pole „{contactField}" jest puste u tego kontaktu', {
          feedName: feedName,
          contactField: contactField,
        }),
      );
      out = out.split(whole).join("");
      continue;
    }

    const cacheKey = `${feedName}|${lookup}`;
    if (!cache.has(cacheKey)) cache.set(cacheKey, await findFeedRow(feedName, lookup));
    const row = cache.get(cacheKey) ?? null;

    if (!row) {
      misses.push(
        t('{feedName}: brak wiersza dla „{lookup}"', { feedName: feedName, lookup: lookup }),
      );
      out = out.split(whole).join("");
      continue;
    }
    const value = row[column];
    if (value === undefined) {
      misses.push(t('{feedName}: brak kolumny „{column}"', { feedName: feedName, column: column }));
      out = out.split(whole).join("");
      continue;
    }
    out = out.split(whole).join(value);
  }

  return { html: out, misses };
}

/** Znacznik do wstawienia w edytorze. */
export function feedTag(feedName: string, contactField: string, column: string): string {
  return `%%FEED:${feedName}|${contactField}|${column}%%`;
}
