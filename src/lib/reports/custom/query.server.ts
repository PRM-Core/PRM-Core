import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db/client.server";
import { listStatuses } from "../../fields/statuses.server";
import { warsawMidnight } from "../../dashboard/activity.server";
import { shiftDay } from "../../dashboard/activity";
import { warsawDay } from "../../visits/warsaw-time";
import {
  findDimension,
  findSource,
  widgetProblems,
  widgetSchema,
  type ReportRange,
  type ReportWidget,
  type SourceKey,
} from "./catalog";
import { resolveRange, shapeResult, type RawRow, type WidgetData } from "./results";
import { bucketExpr, warsawDayExpr } from "./warsaw-sql";
import { localized, t } from "@/lib/i18n";
import { NO_SHOW_GRACE_MS, NO_SHOW_LABEL_PL, STATE_LABELS_PL } from "../../booking-system/status";

/**
 * Własne raporty — tłumaczenie kafelka na zapytanie.
 *
 * **Każdy fragment SQL-a pochodzi z mapy poniżej**, wpisanej w kod. Z definicji
 * raportu bierzemy wyłącznie klucze, które najpierw przechodzą przez katalog
 * (`widgetProblems`), a potem są wyszukiwane tu — nieznany klucz to wyjątek,
 * nie wklejony tekst. Wartości filtrów i granice dat idą jako parametry
 * zapytania. Dzięki temu definicja raportu, nawet spreparowana ręcznie, nie ma
 * jak dopisać czegokolwiek do SQL-a.
 */

interface SqlDimension {
  /** Wyrażenie dające wartość wymiaru — pusty tekst dla braku. */
  expr: string;
  /** Złączenie potrzebne do grupowania po tym wymiarze. */
  join?: string;
  /** Własny warunek filtra (np. tagi siedzą w tablicy JSON). */
  filter?: (values: string[], negate: boolean) => SQL;
}

interface SqlSource {
  from: string;
  date: { column: string; kind: "ms" | "day" };
  measures: Record<string, { expr: string; join?: string }>;
  dimensions: Record<string, SqlDimension>;
}

/** Tekst albo pusty — `NULL` i same spacje to ten sam „brak". */
const txt = (col: string) => `coalesce(trim(${col}), '')`;

/** SQL string literal — labels come from the dictionary and may contain quotes. */
const lit = (text: string) => `'${text.replace(/'/g, "''")}'`;

/**
 * Visit state as the reader's label. A booked visit more than two hours past
 * its start is a no-show — the same rule as `booking-system/status.ts`.
 */
const visitStateLabel = () =>
  `case
    when v.ic_status = 'booked' and v.starts_at is not null
      and v.starts_at + ${NO_SHOW_GRACE_MS} < cast(strftime('%s','now') as integer) * 1000
      then ${lit(t(NO_SHOW_LABEL_PL))}
    ${Object.entries(STATE_LABELS_PL)
      .map(([state, label]) => `when v.ic_status = '${state}' then ${lit(t(label))}`)
      .join("\n    ")}
    else coalesce(trim(v.ic_status), '')
  end`;

const TAGS_JSON = "CASE WHEN json_valid(c.tags) THEN c.tags ELSE '[]' END";

const EMAIL_EVENTS_JOIN = `left join (
    select token,
      max(kind = 'open') as o,
      max(kind = 'click') as k,
      max(kind = 'delivered') as dl,
      max(kind in ('bounce', 'dropped')) as b
    from email_events group by token
  ) ev on ev.token = s.token`;

const SQL_SOURCES: Record<SourceKey, SqlSource> = localized(() => ({
  contacts: {
    from: "contacts c",
    date: { column: "c.created_at", kind: "day" },
    measures: { count: { expr: "count(*)" } },
    dimensions: {
      // Pusty status to „lead" — tak samo jak w całej aplikacji.
      status: { expr: "coalesce(nullif(trim(c.status), ''), 'lead')" },
      source: { expr: txt("c.source") },
      medium: { expr: txt("c.medium") },
      campaign: { expr: txt("c.campaign") },
      tag: {
        // LEFT JOIN, żeby kontakt bez tagów nie znikał z liczenia — trafia do „(brak)".
        expr: txt("tg.value"),
        join: `left join json_each(${TAGS_JSON}) tg`,
        filter: (values, negate) => {
          const named = values.filter((v) => v !== "");
          const parts: SQL[] = [];
          if (named.length > 0) {
            parts.push(
              sql`exists (select 1 from json_each(${sql.raw(TAGS_JSON)}) ft where ${sql.raw(txt("ft.value"))} in (${sql.join(
                named.map((v) => sql`${v}`),
                sql`, `,
              )}))`,
            );
          }
          if (values.includes("")) {
            parts.push(sql`json_array_length(${sql.raw(TAGS_JSON)}) = 0`);
          }
          const any = sql`(${sql.join(parts, sql` or `)})`;
          return negate ? sql`not ${any}` : any;
        },
      },
      consent_email: { expr: "cast(coalesce(c.consent_email, 0) as text)" },
      consent_sms: { expr: "cast(coalesce(c.consent_sms, 0) as text)" },
      phone_only: { expr: "cast(coalesce(c.phone_only, 0) as text)" },
    },
  },
  visits: {
    from: "contact_visits v",
    date: { column: "v.starts_at", kind: "ms" },
    measures: {
      count: { expr: "count(*)" },
      patients: { expr: "count(distinct v.contact_id)" },
      revenue: { expr: "coalesce(sum(v.price_grosze), 0) / 100.0" },
      avg_price: { expr: "avg(v.price_grosze) / 100.0" },
    },
    dimensions: {
      specialization: { expr: txt("v.specialization") },
      doctor: { expr: txt("v.doctor") },
      service: { expr: txt("v.title") },
      source: { expr: txt("v.source") },
      ic_status: { expr: visitStateLabel() },
      patient_status: {
        expr: "coalesce(nullif(trim(pc.status), ''), 'lead')",
        join: "left join contacts pc on pc.id = v.contact_id",
      },
    },
  },
  emails: {
    from: "email_sends s",
    date: { column: "s.sent_at", kind: "ms" },
    measures: {
      sent: { expr: "count(*)" },
      delivered: { expr: "coalesce(sum(ev.dl), 0)", join: EMAIL_EVENTS_JOIN },
      opened: { expr: "coalesce(sum(ev.o), 0)", join: EMAIL_EVENTS_JOIN },
      clicked: { expr: "coalesce(sum(ev.k), 0)", join: EMAIL_EVENTS_JOIN },
      bounced: { expr: "coalesce(sum(ev.b), 0)", join: EMAIL_EVENTS_JOIN },
      open_rate: {
        expr: "coalesce(sum(ev.o), 0) * 1.0 / nullif(count(*), 0)",
        join: EMAIL_EVENTS_JOIN,
      },
      click_rate: {
        expr: "coalesce(sum(ev.k), 0) * 1.0 / nullif(count(*), 0)",
        join: EMAIL_EVENTS_JOIN,
      },
    },
    dimensions: {
      template: {
        expr: txt("ci.name"),
        join: "left join content_items ci on ci.id = s.content_item_id",
      },
      campaign: {
        expr: "CASE WHEN s.campaign_id IS NULL THEN '' ELSE coalesce(trim(cp.template_name), '') || ' · ' || coalesce(trim(cp.segment_name), '') END",
        join: "left join campaigns cp on cp.id = s.campaign_id",
      },
      origin: { expr: "CASE WHEN s.campaign_id IS NOT NULL THEN 'campaign' ELSE 'other' END" },
    },
  },
  sms: {
    from: "sms_sends m",
    date: { column: "m.sent_at", kind: "ms" },
    measures: {
      count: { expr: "count(*)" },
      recipients: { expr: "count(distinct m.contact_id)" },
    },
    dimensions: {
      origin: { expr: "coalesce(nullif(trim(m.source), ''), 'automation')" },
      sender: { expr: txt("m.sender") },
    },
  },
  campaigns: {
    from: "campaigns cp",
    date: { column: "cp.created_at", kind: "ms" },
    measures: {
      count: { expr: "count(*)" },
      sent: { expr: "coalesce(sum(cp.sent_count), 0)" },
      failed: { expr: "coalesce(sum(cp.failed_count), 0)" },
      audience: { expr: "coalesce(sum(cp.audience_count), 0)" },
    },
    dimensions: {
      kind: { expr: txt("cp.kind") },
      status: { expr: txt("cp.status") },
      segment: { expr: txt("cp.segment_name") },
      template: { expr: txt("cp.template_name") },
    },
  },
  inbox: {
    from: "inbox_messages im",
    date: { column: "im.created_at", kind: "ms" },
    measures: {
      count: { expr: "count(*)" },
      contacts: { expr: "count(distinct im.contact_id)" },
    },
    dimensions: {
      channel: { expr: txt("im.channel") },
      direction: { expr: txt("im.direction") },
    },
  },
}));

/**
 * Bezpiecznik: tyle surowych wierszy na kafelek. Przy dwóch wymiarach po kilka
 * tysięcy wartości kombinacji potrafi być bardzo dużo; zamiast po cichu ciąć
 * dane mówimy wprost, że trzeba zawęzić.
 */
const ROW_CAP = 20000;

export class ReportQueryError extends Error {}

interface Compiled {
  query: SQL;
  from: string;
  to: string;
}

/** Kafelek + zakres → zapytanie. Eksportowane dla testów. */
export function compileWidget(widget: ReportWidget, range: { from: string; to: string }): Compiled {
  const problems = widgetProblems(widget);
  if (problems.length > 0) throw new ReportQueryError(problems[0]);
  const source = findSource(widget.source)!;
  const spec = SQL_SOURCES[source.key];

  const startMs = warsawMidnight(range.from);
  const endMs = warsawMidnight(shiftDay(range.to, 1));
  const joins = new Set<string>();

  const dayExpr =
    spec.date.kind === "day" ? spec.date.column : warsawDayExpr(spec.date.column, startMs, endMs);

  const dimExprs = widget.dimensions.map((key) => {
    const def = findDimension(source, key)!;
    if (def.kind === "time") return bucketExpr(key as "day" | "week" | "month", dayExpr);
    const d = spec.dimensions[key];
    if (!d) throw new ReportQueryError(`Brak definicji wymiaru ${key}.`);
    if (d.join) joins.add(d.join);
    return d.expr;
  });

  const measureExprs = widget.measures.map((key) => {
    const m = spec.measures[key];
    if (!m) throw new ReportQueryError(`Brak definicji miary ${key}.`);
    if (m.join) joins.add(m.join);
    return m.expr;
  });

  const where: SQL[] =
    spec.date.kind === "day"
      ? [
          sql`${sql.raw(spec.date.column)} >= ${range.from}`,
          sql`${sql.raw(spec.date.column)} <= ${range.to}`,
        ]
      : [
          sql`${sql.raw(spec.date.column)} >= ${startMs}`,
          sql`${sql.raw(spec.date.column)} < ${endMs}`,
        ];

  for (const f of widget.filters) {
    const d = spec.dimensions[f.dimension];
    if (!d) throw new ReportQueryError(`Brak definicji filtra ${f.dimension}.`);
    const negate = f.operator === "not_in";
    if (d.filter) {
      where.push(d.filter(f.values, negate));
      continue;
    }
    if (d.join) joins.add(d.join);
    const list = sql.join(
      f.values.map((v) => sql`${v}`),
      sql`, `,
    );
    where.push(
      negate ? sql`${sql.raw(d.expr)} not in (${list})` : sql`${sql.raw(d.expr)} in (${list})`,
    );
  }

  const select = [
    ...dimExprs.map((e, i) => sql.raw(`${e} as d${i}`)),
    ...measureExprs.map((e, i) => sql.raw(`${e} as m${i}`)),
  ];
  const groupBy =
    dimExprs.length > 0
      ? sql` group by ${sql.raw(dimExprs.map((_, i) => `d${i}`).join(", "))}`
      : sql``;

  const query = sql`select ${sql.join(select, sql`, `)} from ${sql.raw(spec.from)} ${sql.raw(
    [...joins].join(" "),
  )} where ${sql.join(where, sql` and `)}${groupBy} limit ${ROW_CAP + 1}`;
  return { query, from: range.from, to: range.to };
}

/**
 * Wymiary, których wartości to klucze statusów kontaktu z tabeli placówki.
 * Po parze (źródło, wymiar), nie po samym kluczu — kampania też ma `status`,
 * ale to „Wysłana", „Zaplanowana", a nie „Pacjent".
 */
const CONTACT_STATUS_DIMENSIONS = new Set(["contacts:status", "visits:patient_status"]);

/**
 * Etykiety wartości: z katalogu, a statusy kontaktu — z tabeli statusów placówki.
 * Tabelę statusów czytamy tylko wtedy, gdy kafelek ma wymiar statusu — pozostałe
 * nie mają po co jej dotykać.
 */
async function labeler(
  sourceKey: SourceKey,
  dimensions: string[],
): Promise<(dimension: string, value: string) => string> {
  const source = findSource(sourceKey)!;
  const needsStatuses = dimensions.some((d) => CONTACT_STATUS_DIMENSIONS.has(`${sourceKey}:${d}`));
  const statuses = new Map(
    needsStatuses ? (await listStatuses()).map((s) => [s.key, s.label]) : [],
  );
  return (dimension, value) => {
    const fromCatalog = findDimension(source, dimension)?.valueLabels?.[value];
    if (fromCatalog) return fromCatalog;
    if (CONTACT_STATUS_DIMENSIONS.has(`${sourceKey}:${dimension}`)) {
      return statuses.get(value) ?? value;
    }
    return value;
  };
}

export async function runWidget(input: {
  widget: unknown;
  range: ReportRange;
  today?: string;
}): Promise<WidgetData> {
  const parsed = widgetSchema.safeParse(input.widget);
  if (!parsed.success) throw new ReportQueryError(t("Kafelek ma niepoprawną definicję."));
  const widget = parsed.data;
  const resolved = resolveRange(input.range, input.today ?? warsawDay(Date.now()));
  if ("error" in resolved) throw new ReportQueryError(resolved.error);

  const compiled = compileWidget(widget, resolved);
  const raw = (await getDb().all<RawRow>(compiled.query)) ?? [];
  if (raw.length > ROW_CAP) {
    throw new ReportQueryError(
      t(
        "Za dużo kombinacji do pokazania — zawęź zakres dat, dodaj filtr albo zmień wymiar na mniej szczegółowy.",
      ),
    );
  }

  const source = findSource(widget.source)!;
  const labelOf = await labeler(source.key, widget.dimensions);
  const shaped = shapeResult({
    widget,
    source,
    raw,
    from: resolved.from,
    to: resolved.to,
    labelOf,
  });

  const usesStatus = widget.dimensions.some((d) =>
    CONTACT_STATUS_DIMENSIONS.has(`${source.key}:${d}`),
  );
  if (!usesStatus) return shaped;
  const valueColors: Record<string, string> = {};
  for (const s of await listStatuses()) if (s.color) valueColors[s.key] = s.color;
  return { ...shaped, valueColors };
}

/**
 * Wartości do wyboru w filtrze — najczęstsze w zakresie raportu, z etykietami.
 */
export async function listFilterValues(input: {
  source: string;
  dimension: string;
  range: ReportRange;
  today?: string;
}): Promise<{ value: string; label: string; count: number }[]> {
  const source = findSource(input.source);
  const def = source ? findDimension(source, input.dimension) : undefined;
  if (!source || !def || !def.filterable)
    throw new ReportQueryError(t("Nie da się filtrować po tym polu."));
  const resolved = resolveRange(input.range, input.today ?? warsawDay(Date.now()));
  if ("error" in resolved) throw new ReportQueryError(resolved.error);

  const probe: ReportWidget = {
    id: "wartosci",
    type: "table",
    title: "",
    width: "full",
    source: source.key,
    measures: [source.measures[0].key],
    dimensions: [def.key],
    filters: [],
    limit: 100,
  };
  const data = await runWidget({ widget: probe, range: input.range, today: input.today });
  // Do 100 najczęstszych wartości w zakresie — rzadsze wpisuje się w filtr ręcznie.
  return data.rows.map((r) => ({
    value: String(r.d0),
    label: String(r.d0_label),
    count: Number(r.m0 ?? 0),
  }));
}
