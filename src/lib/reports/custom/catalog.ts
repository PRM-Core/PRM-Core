import { z } from "zod";
import { t, localized } from "@/lib/i18n";

/**
 * Własne raporty — katalog danych i kształt definicji raportu.
 *
 * **To jest jedyna lista tego, co wolno zapytać.** Ekran buduje z niej paletę,
 * a serwer odrzuca wszystko, czego tu nie ma. Definicja raportu nigdy nie
 * zawiera SQL-a ani nazw kolumn — tylko klucze z tego pliku, które
 * `query.server.ts` tłumaczy na zapytanie z własnej, zamkniętej mapy.
 *
 * **Wyłącznie agregaty.** Żadnego wymiaru z imieniem, nazwiskiem, e-mailem,
 * telefonem, PESEL-em ani treścią wiadomości. Raport odpowiada na pytanie „ile"
 * i „w jakim podziale", a nie „kto". Lista pacjentów jest w Kontaktach, gdzie
 * obowiązują uprawnienia do kartoteki. Z tego samego powodu nie ma tu tematu
 * e-maila — bywa personalizowany imieniem odbiorcy; zamiast niego jest nazwa
 * szablonu.
 *
 * Moduł jest czysty (bez bazy i bez `node:*`) — importują go ekran i serwer.
 */

export type SourceKey = "contacts" | "visits" | "emails" | "sms" | "campaigns" | "inbox";
export type TimeGrain = "day" | "week" | "month";
export type ValueFormat = "number" | "currency" | "percent";
export type WidgetType = "kpi" | "bar" | "line" | "table";
export type WidgetWidth = "half" | "full";

export interface MeasureDef {
  key: string;
  label: string;
  format: ValueFormat;
  hint?: string;
  /**
   * `false` dla średnich i wskaźników. Okres bez danych dostaje wtedy pustą
   * wartość zamiast zera — „0% otwarć" w dniu bez żadnej wysyłki byłoby
   * nieprawdą, a zero na wykresie ciągnęłoby linię w dół.
   */
  additive?: boolean;
}

export interface DimensionDef {
  key: string;
  label: string;
  kind: "category" | "boolean" | "time";
  /** Czytelne nazwy wartości zapisanych w bazie jako klucze. */
  valueLabels?: Record<string, string>;
  /** Czy da się po nim filtrować (wymiary czasu filtruje zakres dat raportu). */
  filterable: boolean;
}

export interface SourceDef {
  key: SourceKey;
  label: string;
  description: string;
  /** Po czym liczy się zakres dat raportu — mówione wprost na ekranie. */
  dateLabel: string;
  measures: MeasureDef[];
  dimensions: DimensionDef[];
}

const TIME_DIMENSIONS: DimensionDef[] = localized(() => [
  { key: "day", label: t("Dzień"), kind: "time", filterable: false },
  { key: "week", label: t("Tydzień"), kind: "time", filterable: false },
  { key: "month", label: t("Miesiąc"), kind: "time", filterable: false },
]);

export const TIME_GRAINS: Record<string, TimeGrain> = { day: "day", week: "week", month: "month" };

const YES_NO = { "1": "Tak", "0": "Nie" };

export const SOURCES: SourceDef[] = localized(() => [
  {
    key: "contacts",
    label: t("Kontakty"),
    description: t("Kontakty w bazie według daty dodania."),
    dateLabel: "data dodania kontaktu",
    measures: [{ key: "count", label: t("Liczba kontaktów"), format: "number" }],
    dimensions: [
      { key: "status", label: t("Status"), kind: "category", filterable: true },
      { key: "source", label: t("Źródło"), kind: "category", filterable: true },
      { key: "medium", label: t("Medium"), kind: "category", filterable: true },
      { key: "campaign", label: t("Kampania (UTM)"), kind: "category", filterable: true },
      {
        key: "tag",
        label: t("Tag"),
        kind: "category",
        filterable: true,
      },
      {
        key: "consent_email",
        label: t("Zgoda na e-mail"),
        kind: "boolean",
        valueLabels: YES_NO,
        filterable: true,
      },
      {
        key: "consent_sms",
        label: t("Zgoda na SMS"),
        kind: "boolean",
        valueLabels: YES_NO,
        filterable: true,
      },
      {
        key: "phone_only",
        label: t("Tylko kontakt telefoniczny"),
        kind: "boolean",
        valueLabels: YES_NO,
        filterable: true,
      },
      ...TIME_DIMENSIONS,
    ],
  },
  {
    key: "visits",
    label: t("Wizyty"),
    description: t("Wizyty pacjentów według terminu wizyty."),
    dateLabel: "termin wizyty",
    measures: [
      { key: "count", label: t("Liczba wizyt"), format: "number" },
      {
        key: "patients",
        label: t("Liczba pacjentów"),
        format: "number",
        hint: t("Różne osoby — trzy wizyty jednego pacjenta to jeden pacjent."),
      },
      {
        key: "revenue",
        label: t("Przychód"),
        format: "currency",
        hint: t("Suma cen wizyt, dla których cena jest znana."),
      },
      {
        key: "avg_price",
        label: t("Średnia cena wizyty"),
        format: "currency",
        additive: false,
        hint: t("Tylko wizyty z podaną ceną."),
      },
    ],
    dimensions: [
      { key: "specialization", label: t("Specjalizacja"), kind: "category", filterable: true },
      { key: "doctor", label: t("Lekarz"), kind: "category", filterable: true },
      { key: "service", label: t("Usługa"), kind: "category", filterable: true },
      { key: "source", label: t("Źródło rezerwacji"), kind: "category", filterable: true },
      {
        key: "ic_status",
        label: t("Status w systemie rezerwacji"),
        kind: "category",
        filterable: true,
      },
      {
        key: "patient_status",
        label: t("Status pacjenta"),
        kind: "category",
        filterable: true,
      },
      ...TIME_DIMENSIONS,
    ],
  },
  {
    key: "emails",
    label: t("E-maile"),
    description: t("Wysłane wiadomości e-mail według daty wysyłki."),
    dateLabel: t("data wysyłki"),
    measures: [
      { key: "sent", label: t("Wysłane"), format: "number" },
      { key: "delivered", label: t("Doręczone"), format: "number" },
      {
        key: "opened",
        label: t("Otwarte"),
        format: "number",
        hint: t("Wiadomości otwarte co najmniej raz."),
      },
      { key: "clicked", label: t("Kliknięte"), format: "number" },
      { key: "bounced", label: t("Odbite"), format: "number" },
      {
        key: "open_rate",
        label: t("Wskaźnik otwarć"),
        format: "percent",
        additive: false,
        hint: t("Otwarte ÷ wysłane."),
      },
      {
        key: "click_rate",
        label: t("Wskaźnik kliknięć"),
        format: "percent",
        additive: false,
        hint: t("Kliknięte ÷ wysłane."),
      },
    ],
    dimensions: [
      { key: "template", label: t("Szablon treści"), kind: "category", filterable: true },
      { key: "campaign", label: t("Kampania"), kind: "category", filterable: true },
      {
        key: "origin",
        label: t("Rodzaj wysyłki"),
        kind: "category",
        valueLabels: { campaign: t("Kampania"), other: t("Automatyzacja lub pojedyncza") },
        filterable: true,
      },
      ...TIME_DIMENSIONS,
    ],
  },
  {
    key: "sms",
    label: "SMS",
    description: t("Wysłane SMS-y według daty wysyłki."),
    dateLabel: t("data wysyłki"),
    measures: [
      { key: "count", label: t("Wysłane SMS"), format: "number" },
      { key: "recipients", label: t("Liczba odbiorców"), format: "number" },
    ],
    dimensions: [
      {
        key: "origin",
        label: t("Rodzaj wysyłki"),
        kind: "category",
        valueLabels: {
          automation: "Automatyzacja",
          campaign: "Kampania",
          manual: t("Wysłany ręcznie"),
          agent: "PRM_Agent",
        },
        filterable: true,
      },
      { key: "sender", label: t("Nadawca"), kind: "category", filterable: true },
      ...TIME_DIMENSIONS,
    ],
  },
  {
    key: "campaigns",
    label: t("Kampanie"),
    description: t("Zaplanowane i wysłane kampanie według daty utworzenia."),
    dateLabel: "data utworzenia kampanii",
    measures: [
      { key: "count", label: t("Liczba kampanii"), format: "number" },
      { key: "sent", label: t("Wysłane wiadomości"), format: "number" },
      { key: "failed", label: t("Nieudane wiadomości"), format: "number" },
      { key: "audience", label: t("Odbiorcy (naliczeni)"), format: "number" },
    ],
    dimensions: [
      {
        key: "kind",
        label: t("Kanał"),
        kind: "category",
        valueLabels: { email: "E-mail", newsletter: "Newsletter", sms: "SMS" },
        filterable: true,
      },
      {
        key: "status",
        label: t("Status kampanii"),
        kind: "category",
        valueLabels: {
          scheduled: "Zaplanowana",
          sending: "W trakcie",
          paused: "Wstrzymana",
          sent: t("Wysłana"),
          cancelled: "Anulowana",
          failed: "Nieudana",
        },
        filterable: true,
      },
      { key: "segment", label: t("Segment"), kind: "category", filterable: true },
      { key: "template", label: t("Szablon"), kind: "category", filterable: true },
      ...TIME_DIMENSIONS,
    ],
  },
  {
    key: "inbox",
    label: t("Skrzynka"),
    description: t("Wiadomości w skrzynce omnichannel według daty."),
    dateLabel: t("data wiadomości"),
    measures: [
      { key: "count", label: t("Liczba wiadomości"), format: "number" },
      { key: "contacts", label: t("Liczba kontaktów"), format: "number" },
    ],
    dimensions: [
      {
        key: "channel",
        label: t("Kanał"),
        kind: "category",
        valueLabels: { sms: "SMS", email: "E-mail", form: "Formularz", survey: "Ankieta" },
        filterable: true,
      },
      {
        key: "direction",
        label: t("Kierunek"),
        kind: "category",
        valueLabels: { in: t("Przychodzące"), out: t("Wychodzące") },
        filterable: true,
      },
      ...TIME_DIMENSIONS,
    ],
  },
]);

export const SOURCE_BY_KEY = localized(() => new Map(SOURCES.map((s) => [s.key, s])));

export function findSource(key: string): SourceDef | undefined {
  return SOURCE_BY_KEY.get(key as SourceKey);
}

export function findMeasure(source: SourceDef, key: string): MeasureDef | undefined {
  return source.measures.find((m) => m.key === key);
}

export function findDimension(source: SourceDef, key: string): DimensionDef | undefined {
  return source.dimensions.find((d) => d.key === key);
}

/** Rodzaje kafelków w palecie — z tym, co każdy wymaga. */
export const WIDGET_TYPES: {
  type: WidgetType;
  label: string;
  description: string;
  /** Ile miar najwyżej. */
  maxMeasures: number;
  /** Wymiary: [wymagane, najwięcej]. */
  dimensions: [number, number];
  /** Czy pierwszy wymiar musi być czasem. */
  timeFirst: boolean;
  defaultWidth: WidgetWidth;
}[] = localized(() => [
  {
    type: "kpi",
    label: t("Liczba"),
    description: t("Jedna wartość w wybranym okresie."),
    maxMeasures: 1,
    dimensions: [0, 0],
    timeFirst: false,
    defaultWidth: "half",
  },
  {
    type: "bar",
    label: t("Wykres słupkowy"),
    description: t("Porównanie kategorii, opcjonalnie z rozbiciem."),
    maxMeasures: 1,
    dimensions: [1, 2],
    timeFirst: false,
    defaultWidth: "half",
  },
  {
    type: "line",
    label: t("Wykres liniowy"),
    description: t("Zmiana w czasie, opcjonalnie z rozbiciem."),
    maxMeasures: 1,
    dimensions: [1, 2],
    timeFirst: true,
    defaultWidth: "full",
  },
  {
    type: "table",
    label: t("Tabela"),
    description: t("Kilka miar w podziale na jeden lub dwa wymiary."),
    maxMeasures: 4,
    dimensions: [1, 2],
    timeFirst: false,
    defaultWidth: "full",
  },
]);

export const WIDGET_TYPE_BY_KEY = localized(() => new Map(WIDGET_TYPES.map((w) => [w.type, w])));

/** Najwięcej pozycji kategorii na wykresie/tabeli — reszta jest zgłaszana jako ucięta. */
export const MAX_ROWS = 100;
export const DEFAULT_ROWS = 15;
/** Najwięcej serii w rozbiciu — więcej kolorów przestaje być czytelne. */
export const MAX_SERIES = 8;
export const MAX_WIDGETS = 24;
export const MAX_FILTERS = 6;

// ── Kształt definicji ──────────────────────────────────────────────────────

const key = z.string().min(1).max(40);

export const filterSchema = z.object({
  dimension: key,
  /** `in` — wartość jest na liście; `not_in` — nie jest. */
  operator: z.enum(["in", "not_in"]),
  values: z.array(z.string().max(200)).min(1).max(50),
});

export const widgetSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(["kpi", "bar", "line", "table"]),
  title: z.string().max(120).default(""),
  width: z.enum(["half", "full"]).default("half"),
  source: key,
  measures: z.array(key).min(1).max(4),
  dimensions: z.array(key).max(2).default([]),
  filters: z.array(filterSchema).max(MAX_FILTERS).default([]),
  limit: z.number().int().min(1).max(MAX_ROWS).default(DEFAULT_ROWS),
});

export const rangeSchema = z.object({
  preset: z.enum(["7", "30", "90", "365", "this_month", "last_month", "this_year", "custom"]),
  from: z.string().default(""),
  to: z.string().default(""),
});

export const definitionSchema = z.object({
  range: rangeSchema,
  widgets: z.array(widgetSchema).max(MAX_WIDGETS),
});

export type ReportFilter = z.infer<typeof filterSchema>;
export type ReportWidget = z.infer<typeof widgetSchema>;
export type ReportRange = z.infer<typeof rangeSchema>;
export type ReportDefinition = z.infer<typeof definitionSchema>;

/**
 * Co jest nie tak z kafelkiem względem katalogu — lista zdań dla człowieka.
 * Pusta lista znaczy „da się policzyć". Ten sam sprawdzian robi serwer przed
 * zapytaniem i ekran przed pokazaniem podglądu.
 */
export function widgetProblems(w: ReportWidget): string[] {
  const problems: string[] = [];
  const source = findSource(w.source);
  if (!source) return [t("Nieznane źródło danych.")];
  const type = WIDGET_TYPE_BY_KEY.get(w.type);
  if (!type) return ["Nieznany rodzaj kafelka."];

  if (w.measures.length === 0) problems.push(t("Wybierz, co liczyć."));
  if (w.measures.length > type.maxMeasures) {
    problems.push(
      t("{label} pokazuje najwyżej {maxMeasures} {v2}.", {
        label: type.label,
        maxMeasures: type.maxMeasures,
        v2: type.maxMeasures === 1 ? t("miarę") : "miary",
      }),
    );
  }
  for (const m of w.measures) {
    if (!findMeasure(source, m))
      problems.push(t("Miara „{m}” nie należy do źródła {label}.", { m: m, label: source.label }));
  }
  if (new Set(w.measures).size !== w.measures.length)
    problems.push(t("Ta sama miara wybrana dwa razy."));

  const [minDims, maxDims] = type.dimensions;
  if (w.dimensions.length < minDims) problems.push(t("Wybierz, po czym grupować."));
  if (w.dimensions.length > maxDims) {
    problems.push(
      maxDims === 0
        ? t("{label} nie ma podziału.", { label: type.label })
        : t("Najwyżej {maxDims} wymiary.", { maxDims: maxDims }),
    );
  }
  const dims = w.dimensions.map((d) => findDimension(source, d));
  dims.forEach((d, i) => {
    if (!d)
      problems.push(
        t("Wymiar „{v0}” nie należy do źródła {label}.", {
          v0: w.dimensions[i],
          label: source.label,
        }),
      );
  });
  if (new Set(w.dimensions).size !== w.dimensions.length)
    problems.push(t("Ten sam wymiar wybrany dwa razy."));
  if (type.timeFirst && dims[0] && dims[0].kind !== "time") {
    problems.push(t("Wykres liniowy grupuje najpierw po czasie: dzień, tydzień albo miesiąc."));
  }
  if (dims.filter((d) => d?.kind === "time").length > 1) {
    problems.push("Tylko jeden wymiar czasu naraz.");
  }

  for (const f of w.filters) {
    const d = findDimension(source, f.dimension);
    if (!d) problems.push(t("Filtr po nieznanym polu „{dimension}”.", { dimension: f.dimension }));
    else if (!d.filterable)
      problems.push(t("Po polu „{label}” nie da się filtrować.", { label: d.label }));
  }
  return problems;
}

/**
 * Kafelek bez filtrów, w których nie zaznaczono jeszcze żadnej wartości.
 *
 * Filtr dodany w panelu startuje pusty, zanim ktoś wybierze wartości. Taki
 * filtr nic nie zawęża, więc podgląd i zapis go pomijają — zamiast odrzucać
 * cały kafelek jako niepoprawny w połowie klikania.
 */
export function withoutEmptyFilters(w: ReportWidget): ReportWidget {
  const filters = w.filters.filter((f) => f.values.length > 0);
  return filters.length === w.filters.length ? w : { ...w, filters };
}

/** Nowy kafelek z palety — od razu policzalny, żeby podgląd nie startował od błędu. */
export function newWidget(type: WidgetType, id: string): ReportWidget {
  const spec = WIDGET_TYPE_BY_KEY.get(type)!;
  const base = {
    id,
    type,
    title: "",
    width: spec.defaultWidth,
    source: "contacts",
    measures: ["count"],
    filters: [],
    limit: DEFAULT_ROWS,
  };
  switch (type) {
    case "kpi":
      return { ...base, dimensions: [] };
    case "line":
      return { ...base, dimensions: ["day"] };
    case "bar":
      return { ...base, dimensions: ["status"] };
    case "table":
      return { ...base, dimensions: ["source"] };
  }
}

/**
 * Po zmianie źródła kafelek dostaje pierwszą miarę i pasujący wymiar nowego
 * źródła — stare klucze do niego nie należą i podgląd od razu by się wywrócił.
 */
export function switchSource(w: ReportWidget, sourceKey: SourceKey): ReportWidget {
  const source = findSource(sourceKey)!;
  const type = WIDGET_TYPE_BY_KEY.get(w.type)!;
  const firstCategory = source.dimensions.find((d) => d.kind !== "time");
  const dims =
    type.dimensions[0] === 0
      ? []
      : type.timeFirst
        ? ["day"]
        : firstCategory
          ? [firstCategory.key]
          : ["day"];
  return {
    ...w,
    source: sourceKey,
    measures: [source.measures[0].key],
    dimensions: dims,
    filters: [],
  };
}

/** Domyślny tytuł, gdy użytkownik nie wpisał własnego. */
export function widgetTitle(w: ReportWidget): string {
  if (w.title.trim()) return w.title.trim();
  const source = findSource(w.source);
  if (!source) return "Kafelek";
  const measure = findMeasure(source, w.measures[0])?.label ?? "";
  const dim = w.dimensions[0] ? findDimension(source, w.dimensions[0])?.label : "";
  return dim ? `${measure} — ${dim.toLowerCase()}` : measure;
}
