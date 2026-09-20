import { t } from "@/lib/i18n"; /**
 * Logotyp PRM Core.
 *
 * **Zastępuje poprzedni okrągły emblemat (dymek z dwiema postaciami) razem
 * z osobnym napisem „PRM Core"** — teraz to jeden lockup zgodny z brand
 * bookiem: kwadratowy znak z ukośną kreską, wordmark „PRM" i wyniesione „Core".
 *
 * **Rysowany jako SVG, nie wczytywany jako plik.** Trzy powody:
 * skaluje się bez rozmycia na ekranach o wysokiej gęstości, waży ułamek
 * bitmapy, a kolory bierze z motywu — więc w trybie ciemnym znak nie zostaje
 * granatowym prostokątem na czarnym tle.
 *
 * Proporcje pochodzą z księgi znaku: „Core" jest wyniesione tak, że jego górna
 * krawędź równa się wysokości wersalika „PRM".
 */

/** Sam znak — kwadrat z ukośną kreską. Do favikony, awatarów i miejsc bez wordmarku. */
export function PrmMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" className="fill-[#1B2A4A] dark:fill-[#F4F6F9]" />
      <path
        d="M22 16 L42 46"
        strokeWidth={7.5}
        strokeLinecap="round"
        className="stroke-white dark:stroke-[#1B2A4A]"
        fill="none"
      />
    </svg>
  );
}

/**
 * Pełny logotyp: znak + „PRM" + wyniesione „Core".
 *
 * Napisy są tekstem SVG, a nie ścieżkami, bo krój firmowy i tak jest wczytany
 * dla całego interfejsu — zamiana na ścieżki dawałaby ten sam obraz przy
 * większym pliku i bez możliwości poprawienia kerningu jedną liczbą.
 */
export function PrmLogo({ className = "h-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 196 64"
      className={className}
      role="img"
      aria-label={t("PRM Core")}
      preserveAspectRatio="xMinYMid meet"
    >
      <rect width="64" height="64" rx="14" className="fill-[#1B2A4A] dark:fill-[#F4F6F9]" />
      <path
        d="M22 16 L42 46"
        strokeWidth={7.5}
        strokeLinecap="round"
        className="stroke-white dark:stroke-[#1B2A4A]"
        fill="none"
      />
      {/* Wordmark. `dominant-baseline` zamiast ręcznego przesuwania w pionie —
          inaczej wyrównanie rozjeżdża się przy każdej zmianie rozmiaru. */}
      <text
        x="78"
        y="33"
        fontFamily="var(--font-display)"
        fontSize="34"
        fontWeight="800"
        letterSpacing="-1.2"
        dominantBaseline="central"
        className="fill-[#1B2A4A] dark:fill-[#F4F6F9]"
      >
        {t("PRM")}
      </text>
      {/* „Core" wyniesione do wysokości wersalika, w Steel Blue — tak jak
          w księdze znaku. Ustawione **tuż przy „M"** (zmierzone: wordmark
          kończy się na 150,2), bo w logotypie oba człony się stykają;
          wcześniejsze 163 dawało 13 px prześwitu i lockup rozpadał się na
          dwa osobne słowa. */}
      <text
        x="152"
        y="18"
        fontFamily="var(--font-display)"
        fontSize="17"
        fontWeight="600"
        letterSpacing="-0.2"
        dominantBaseline="central"
        className="fill-[#5C7080] dark:fill-[#5C7080]"
      >
        {t("Core")}
      </text>
    </svg>
  );
}

/**
 * Kafelek ze znakiem — używany tam, gdzie potrzebny jest kwadratowy symbol
 * bez wordmarku (awatar aplikacji, wąska nawigacja).
 *
 * Zostaje pod dotychczasową nazwą, bo wołają go dwa miejsca; kafelek nie ma
 * już własnego tła ani obramowania — znak sam jest kwadratem i podwójna ramka
 * wyglądała jak pomyłka składu.
 */
export function PrmLogoTile({
  className = "h-9 w-9",
}: {
  className?: string;
  /** Zachowane dla zgodności wywołań; znak nie ma już osobnej ikony w środku. */
  iconClassName?: string;
}) {
  return <PrmMark className={className} />;
}
