/**
 * Godzina „ścienna" z Polski na znacznik czasu.
 *
 * Wszystkie rejestracje są w Polsce, a i formularz na stronie, i system rezerwacji
 * przysyłają datę i godzinę **bez strefy**. Serwer chodzi w UTC, więc odczytanie
 * ich wprost przesuwałoby każdą wizytę o godzinę albo dwie — po cichu i tylko
 * przez część roku.
 *
 * Offset jest pytany kalendarza **dla tej konkretnej daty**, więc przełomy
 * czasu w marcu i październiku też się zgadzają.
 *
 * Plik jest wspólny dla webhooka rezerwacji i importu z systemu rezerwacji: dwie
 * kopie tej samej arytmetyki rozjechałyby się przy pierwszej poprawce, a wtedy
 * ta sama wizyta miałaby dwie różne godziny zależnie od tego, którędy weszła.
 */
export function warsawWallClockToIso(date: string, time: string): string {
  const d = date.trim();
  const t = (time.trim() || "00:00").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return "";

  // Odczytaj wartość naiwną jako UTC, zmierz, jak daleko była wtedy Warszawa
  // od UTC, i przesuń dokładnie o tyle.
  const asUtc = new Date(`${d}T${t}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return "";
  const inWarsaw = new Date(asUtc.toLocaleString("en-US", { timeZone: "Europe/Warsaw" }));
  const inUtc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = inWarsaw.getTime() - inUtc.getTime();
  return new Date(asUtc.getTime() - offsetMs).toISOString();
}

/**
 * Dzisiejsza data w Polsce, `RRRR-MM-DD`.
 *
 * **Zastępuje `new Date().toISOString().slice(0, 10)`**, które liczy dzień
 * w UTC. Latem Polska jest o dwie godziny do przodu, więc wszystko, co wydarzy
 * się między północą a 2:00, UTC zalicza jeszcze do dnia poprzedniego —
 * kontakt założony o 00:15 dostawał wczorajszą datę i nie pojawiał się
 * w dzisiejszych statystykach. Zimą to samo dotyczy pierwszej godziny doby.
 *
 * Objaw: kontakt z aktywnością o 00:15 dostawał datę dodania z poprzedniego
 * dnia.
 */
export function warsawToday(now: number = Date.now()): string {
  return warsawDay(now);
}

/**
 * Data dnia w Polsce dla dowolnego znacznika czasu, `RRRR-MM-DD`.
 *
 * `sv-SE` jako jedyna popularna lokalizacja daje kolejność rok-miesiąc-dzień
 * z zerami wiodącymi — czyli format, który sortuje się poprawnie jako napis.
 * Ta sama sztuczka co w `formatActivityDate`.
 */
export function warsawDay(ms: number): string {
  return new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
}

/**
 * Przesunięcie Warszawy od UTC dla **konkretnej daty**, w formacie `+02:00`.
 *
 * Pytane per data, nie raz na stałe: między marcem a październikiem Polska jest
 * o dwie godziny do przodu, poza tym o jedną. Wpisana na sztywno wartość
 * rozjeżdżałaby wykresy dwa razy w roku — i to akurat w tygodniach, w których
 * nikt nie szuka takiej przyczyny.
 */
export function warsawOffset(ms: number): string {
  const d = new Date(ms);
  const inWarsaw = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Warsaw" }));
  const inUtc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const minutes = Math.round((inWarsaw.getTime() - inUtc.getTime()) / 60000);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Która minuta doby jest teraz w Polsce (0–1439).
 *
 * Do porównywania z oknem „od 7:00 do 18:00": godzina ścienna, a nie UTC —
 * latem serwer w UTC pokazuje 5:00, gdy w Polsce jest 7:00, więc wysyłka
 * ruszałaby dwie godziny za wcześnie. Ten sam błąd co przy dacie dodania
 * kontaktu, tylko trudniejszy do zauważenia, bo bez ofiary w postaci
 * konkretnego rekordu.
 */
export function warsawMinuteOfDay(ms: number): number {
  const hhmm = new Date(ms).toLocaleTimeString("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
