import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Filter, Loader2, Minus } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { getPatientActivity } from "@/lib/api/dashboard.functions";
import {
  MAX_RANGE_DAYS,
  change,
  rangeError,
  rangeLength,
  shiftDay,
  type Change,
} from "@/lib/dashboard/activity";
import type { PatientActivity, StatusOption } from "@/lib/dashboard/activity.server";
import { warsawDay } from "@/lib/visits/warsaw-time";
import { intlLocale, t as tr, localized } from "@/lib/i18n";

/**
 * Karta „Aktywność pacjentów": zakres dat, filtr statusów i porównanie tydzień
 * do tygodnia.
 *
 * Liczby przychodzą z `getPatientActivity`; tu jest wyłącznie wybór, co
 * pokazać, i to, jak to pokazać. Zmiana procentowa liczona jest tą samą funkcją
 * `change()` co w testach — ekran nie ma własnej wersji tego rachunku.
 */

type Preset = "7" | "14" | "30" | "90" | "custom";
type Metric = "nowe" | "aktywni";

const PRESETS: { value: Preset; label: string }[] = localized(() => [
  { value: "7", label: tr("Ostatnie 7 dni") },
  { value: "14", label: tr("Ostatnie 14 dni") },
  { value: "30", label: tr("Ostatnie 30 dni") },
  { value: "90", label: tr("Ostatnie 90 dni") },
  { value: "custom", label: tr("Własny zakres") },
]);

/** Barwy zapasowe — dla statusów, którym placówka nie nadała koloru. */
const FALLBACK_COLORS = [
  "oklch(0.62 0.17 300)",
  "oklch(0.66 0.15 30)",
  "oklch(0.60 0.14 200)",
  "oklch(0.70 0.12 130)",
];

const STORAGE_KEY = "prm-dashboard-activity";

interface Saved {
  preset: Preset;
  from: string;
  to: string;
  statuses: string[];
  compare: boolean;
  metric: Metric;
}

function today(): string {
  return warsawDay(Date.now());
}

function presetRange(preset: Exclude<Preset, "custom">): { from: string; to: string } {
  const to = today();
  return { from: shiftDay(to, -(Number(preset) - 1)), to };
}

/**
 * Ustawienia zapamiętane w przeglądarce. Każdy odczyt w try/catch — w trybie
 * prywatnym albo przy zablokowanych danych witryny `localStorage` potrafi rzucić,
 * a karta ma wtedy po prostu wystartować z wartościami domyślnymi.
 */
function defaults(): Saved {
  return { preset: "7", ...presetRange("7"), statuses: [], compare: false, metric: "nowe" };
}

function loadSaved(): Saved {
  const fallback = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const s = JSON.parse(raw) as Partial<Saved>;
    const saved = PRESETS.some((p) => p.value === s.preset) ? (s.preset as Preset) : "7";
    // Własny zakres wraca tylko wtedy, gdy nadal jest poprawny; zepsuty spada do 7 dni.
    const customOk = saved === "custom" && !rangeError(s.from ?? "", s.to ?? "");
    const preset: Preset = saved === "custom" && !customOk ? "7" : saved;
    // Zakres z presetu liczony od dziś, nie odtwarzany — „ostatnie 7 dni”
    // zapisane w piątek ma w poniedziałek znaczyć ostatnie 7 dni od poniedziałku.
    const range =
      preset === "custom" ? { from: s.from as string, to: s.to as string } : presetRange(preset);
    return {
      preset,
      ...range,
      statuses: Array.isArray(s.statuses) ? s.statuses.filter((x) => typeof x === "string") : [],
      // Porównanie celowo NIE wraca z pamięci — przy każdym wejściu na pulpit
      // startuje wyłączone. Włącza się je na
      // chwilę, gdy jest potrzebne; zapamiętane „włączone” zaśmiecałoby wykres
      // przy każdym logowaniu.
      compare: false,
      metric: s.metric === "aktywni" ? "aktywni" : "nowe",
    };
  } catch {
    return fallback;
  }
}

function save(s: Saved) {
  try {
    const { compare: _pomijane, ...doZapisu } = s;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doZapisu));
  } catch {
    // Brak zapisu ustawień nie może zepsuć karty.
  }
}

/** Data jako punkt w środku dnia UTC — żadna strefa przeglądarki jej nie przesunie. */
function asDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

function shortDate(day: string): string {
  return asDate(day).toLocaleDateString(intlLocale(), {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

function axisLabel(day: string, days: number): string {
  if (days > 14) return shortDate(day);
  const weekday = asDate(day).toLocaleDateString(intlLocale(), {
    weekday: "short",
    timeZone: "UTC",
  });
  return `${weekday} ${shortDate(day)}`;
}

/**
 * Wielka litera tylko na początku. CSS-owe `capitalize` podnosi każde słowo
 * i robiło „Wtorek, 24 Marca" — po polsku nazwę miesiąca piszemy małą literą.
 */
function upperFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase(intlLocale()) + text.slice(1);
}

function longDate(day: string): string {
  return asDate(day).toLocaleDateString(intlLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function percentLabel(c: Change): string {
  if (c.isNew) return "nowe";
  if (c.fraction === null) return "—";
  const p = Math.round(c.fraction * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

/**
 * Strzałka i procent. `size` zamiast dopisywania klas z zewnątrz: dwie klasy
 * wielkości tekstu w jednym elemencie wygrywa ta, która stoi później w arkuszu
 * Tailwinda, a nie ta dopisana później — kafelek wychodził wtedy mniejszy niż
 * liczby obok.
 */
function ChangeBadge({ value, size = "sm" }: { value: Change; size?: "sm" | "lg" }) {
  const tone =
    value.direction === "up"
      ? "text-success"
      : value.direction === "down"
        ? "text-destructive"
        : "text-muted-foreground";
  const Icon =
    value.direction === "up" ? ArrowUpRight : value.direction === "down" ? ArrowDownRight : Minus;
  const look = size === "lg" ? "gap-1 text-xl font-semibold" : "gap-0.5 text-xs font-medium";
  return (
    <span className={`inline-flex items-center tabular-nums ${look} ${tone}`}>
      <Icon className={size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5"} aria-hidden />
      {percentLabel(value)}
    </span>
  );
}

const METRIC_LABEL: Record<Metric, string> = localized(() => ({
  nowe: tr("Nowe kontakty"),
  aktywni: "Aktywni",
}));

export function PatientActivityCard({
  statusTotals,
}: {
  statusTotals: { status: string; count: number }[] | null;
}) {
  /**
   * Najpierw wartości domyślne, zapisane dopiero po zamontowaniu.
   *
   * Strona renderuje się też na serwerze, gdzie `localStorage` nie istnieje.
   * Odczyt w inicjalizatorze stanu dałby na serwerze „7 dni", a w przeglądarce
   * zapamiętane „30 dni" — i React zgłosiłby niezgodność hydracji. `ready`
   * wstrzymuje pierwsze zapytanie, żeby nie pobierać danych dla wartości
   * domyślnych, które za chwilę zostaną podmienione.
   */
  const [settings, setSettings] = useState<Saved>(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setSettings(loadSaved());
    setReady(true);
  }, []);
  const [data, setData] = useState<PatientActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const update = (patch: Partial<Saved>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });

  const invalid = rangeError(settings.from, settings.to);
  const statusKey = settings.statuses.join(",");

  useEffect(() => {
    if (!ready || invalid) return;
    // Numer zapytania: przy szybkim przełączaniu filtrów odpowiedzi potrafią
    // wrócić w innej kolejności, niż wyszły. Pokazujemy tylko ostatnią.
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    getPatientActivity({
      data: { from: settings.from, to: settings.to, statuses: settings.statuses },
    })
      .then((res) => {
        if (id === requestId.current) setData(res);
      })
      .catch((e: unknown) => {
        if (id === requestId.current) {
          setError(e instanceof Error ? e.message : tr("Nie udało się pobrać danych."));
        }
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    // `statusKey` zamiast tablicy — nowa tablica o tej samej treści nie ma
    // wywoływać ponownego zapytania.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, settings.from, settings.to, statusKey, invalid]);

  const options: StatusOption[] = useMemo(() => data?.statusOptions ?? [], [data]);

  // Statusy zapamiętane w przeglądarce, których już nie ma (placówka je usunęła),
  // odfiltrowałyby wszystko do zera bez żadnego wyjaśnienia. Zdejmujemy je.
  useEffect(() => {
    if (options.length === 0 || settings.statuses.length === 0) return;
    const known = new Set(options.map((o) => o.key));
    const kept = settings.statuses.filter((s) => known.has(s));
    if (kept.length !== settings.statuses.length) update({ statuses: kept });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  /**
   * Barwa statusu liczona po pozycji na PEŁNEJ liście statusów, nie na liście
   * widocznych — inaczej zawężenie filtra przemalowałoby pozostałe słupki
   * i ta sama kategoria miałaby różne kolory w zależności od wyboru.
   */
  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    let spare = 0;
    for (const o of options) {
      map.set(o.key, o.color || FALLBACK_COLORS[spare++ % FALLBACK_COLORS.length]);
    }
    return (key: string) => map.get(key) ?? FALLBACK_COLORS[0];
  }, [options]);

  const labelOf = useMemo(() => {
    const map = new Map(options.map((o) => [o.key, o.label]));
    return (key: string) => map.get(key) ?? key;
  }, [options]);

  const length = invalid ? 0 : rangeLength(settings.from, settings.to);
  const metric = settings.metric;

  const chartData = useMemo(
    () =>
      (data?.days ?? []).map((d) => ({
        ...d,
        label: axisLabel(d.date, data?.days.length ?? 0),
        porownanie: metric === "nowe" ? d.tydzienWczesniej.nowe : d.tydzienWczesniej.aktywni,
      })),
    [data, metric],
  );

  const filterLabel =
    settings.statuses.length === 0
      ? tr("Wszystkie kontakty")
      : settings.statuses.length === 1
        ? labelOf(settings.statuses[0])
        : `${settings.statuses.length} statusy`;

  const visibleTotals = (statusTotals ?? []).filter(
    (t) => settings.statuses.length === 0 || settings.statuses.includes(t.status),
  );

  const toggleStatus = (key: string) => {
    const has = settings.statuses.includes(key);
    update({
      statuses: has ? settings.statuses.filter((s) => s !== key) : [...settings.statuses, key],
    });
  };

  const weekChange = data ? change(data.tydzien[metric], data.poprzedniTydzien[metric]) : null;
  const lastWeekDays = (data?.days ?? []).slice(-7);

  return (
    <Card className="lg:col-span-2 border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="text-base">{tr("Aktywność pacjentów")}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {tr(
              "Nowe kontakty w rozbiciu na status i kontakty, z którymi coś się działo. Status to stan bieżący kontaktu.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="activity-preset" className="text-xs text-muted-foreground">
              {tr("Zakres")}
            </Label>
            <Select
              value={settings.preset}
              onValueChange={(v) => {
                const preset = v as Preset;
                update(preset === "custom" ? { preset } : { preset, ...presetRange(preset) });
              }}
            >
              <SelectTrigger id="activity-preset" className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {settings.preset === "custom" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="activity-from" className="text-xs text-muted-foreground">
                  {tr("Od")}
                </Label>
                <Input
                  id="activity-from"
                  type="date"
                  className="h-9 w-[150px]"
                  value={settings.from}
                  max={settings.to || today()}
                  onChange={(e) => update({ from: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="activity-to" className="text-xs text-muted-foreground">
                  {tr("Do")}
                </Label>
                <Input
                  id="activity-to"
                  type="date"
                  className="h-9 w-[150px]"
                  value={settings.to}
                  min={settings.from}
                  max={today()}
                  onChange={(e) => update({ to: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="space-y-1">
            <span className="block text-xs text-muted-foreground">{tr("Kontakty")}</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <Filter className="h-4 w-4" aria-hidden />
                  {filterLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-0">
                <div className="flex items-center gap-2 px-3 py-2">
                  <Checkbox
                    id="activity-status-all"
                    checked={settings.statuses.length === 0}
                    onCheckedChange={() => update({ statuses: [] })}
                  />
                  <label
                    htmlFor="activity-status-all"
                    className="flex-1 cursor-pointer text-sm font-medium"
                  >
                    {tr("Wszystkie kontakty")}
                  </label>
                </div>
                <Separator />
                <div className="max-h-72 overflow-y-auto p-1">
                  {options.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-muted-foreground">
                      {tr("Wczytywanie statusów…")}
                    </p>
                  ) : (
                    options.map((o) => (
                      <div
                        key={o.key}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`activity-status-${o.key}`}
                          checked={settings.statuses.includes(o.key)}
                          onCheckedChange={() => toggleStatus(o.key)}
                        />
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: colorOf(o.key) }}
                          aria-hidden
                        />
                        <label
                          htmlFor={`activity-status-${o.key}`}
                          className="flex-1 cursor-pointer truncate text-sm"
                        >
                          {o.label}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2 pb-2 sm:ml-auto">
            <Switch
              id="activity-compare"
              checked={settings.compare}
              onCheckedChange={(v) => update({ compare: v })}
            />
            <Label htmlFor="activity-compare" className="text-sm font-normal cursor-pointer">
              {tr("Tydzień do tygodnia")}
            </Label>
          </div>
        </div>

        {invalid && settings.preset === "custom" && (
          <p className="text-xs text-destructive" role="alert">
            {invalid}
          </p>
        )}
      </CardHeader>

      {/* Stan bieżący CAŁEJ bazy (nie zakresu) — zawężony tym samym filtrem,
          żeby „tylko pacjenci" nie pokazywało obok liczby leadów. */}
      {visibleTotals.length > 0 && (
        <div className="flex flex-wrap gap-4 px-6 pb-1">
          {visibleTotals.map((t) => (
            <div key={t.status} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: colorOf(t.status) }}
              />
              <span className="text-sm font-semibold tabular-nums">
                {t.count.toLocaleString(intlLocale())}
              </span>
              <span className="text-xs text-muted-foreground">{labelOf(t.status)}</span>
            </div>
          ))}
          <span className="text-xs text-muted-foreground self-center">{tr("w całej bazie")}</span>
        </div>
      )}

      <CardContent className="space-y-5">
        <div className="relative h-[280px]">
          {error ? (
            <div className="flex h-full items-center justify-center text-sm text-destructive">
              {error}
            </div>
          ) : !data ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Poprzednie dane zostają na ekranie podczas wczytywania — wykres
                  nie mruga przy każdej zmianie filtra. */}
              {loading && (
                <Loader2
                  className="absolute right-2 top-0 h-4 w-4 animate-spin text-muted-foreground"
                  aria-label={tr("Wczytywanie")}
                />
              )}
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="oklch(0.92 0.012 240)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="oklch(0.52 0.03 250)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis
                    stroke="oklch(0.52 0.03 250)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <RTooltip
                    content={(props) => (
                      <ActivityTooltip
                        active={props.active}
                        payload={props.payload}
                        compare={settings.compare}
                        metric={metric}
                        labelOf={labelOf}
                      />
                    )}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  {data.statuses.map((st, i) => (
                    <Bar
                      key={st}
                      dataKey={`byStatus.${st}`}
                      name={labelOf(st)}
                      stackId="nowe"
                      fill={colorOf(st)}
                      radius={i === data.statuses.length - 1 ? [4, 4, 0, 0] : undefined}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="aktywni"
                    name="Aktywni"
                    stroke="oklch(0.45 0.02 250)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  {settings.compare && (
                    <Line
                      type="monotone"
                      dataKey="porownanie"
                      name={tr("{v0} — tydzień wcześniej", { v0: METRIC_LABEL[metric] })}
                      stroke="oklch(0.55 0.02 250)"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </>
          )}
        </div>

        {data && !error && settings.compare && weekChange && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{tr("Tydzień do tygodnia")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {shortDate(data.tydzien.od)}–{shortDate(data.tydzien.do)} {tr(" wobec")}{" "}
                  {shortDate(data.poprzedniTydzien.od)}–{shortDate(data.poprzedniTydzien.do)}
                </p>
              </div>
              <div
                className="inline-flex rounded-lg border border-border/60 bg-background p-0.5"
                role="radiogroup"
                aria-label={tr("Co porównywać")}
              >
                {(["nowe", "aktywni"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={metric === m}
                    onClick={() => update({ metric: m })}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      metric === m
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {METRIC_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{tr("Ten tydzień")}</p>
                <p className="text-xl font-semibold tabular-nums">
                  {data.tydzien[metric].toLocaleString(intlLocale())}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{tr("Tydzień wcześniej")}</p>
                <p className="text-xl font-semibold tabular-nums text-muted-foreground">
                  {data.poprzedniTydzien[metric].toLocaleString(intlLocale())}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{tr("Zmiana")}</p>
                <ChangeBadge value={weekChange} size="lg" />
              </div>
            </div>
            <p className="text-sm">{trendSentence(metric, weekChange)}</p>

            {lastWeekDays.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    {METRIC_LABEL[metric]}{" "}
                    {tr(" dzień po dniu wobec tego samego dnia tydzień wcześniej")}
                  </caption>
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="py-1.5 pr-3 text-left font-medium">{tr("Dzień")}</th>
                      <th className="py-1.5 px-3 text-right font-medium">{tr("Ten tydzień")}</th>
                      <th className="py-1.5 px-3 text-right font-medium">
                        {tr("Tydzień wcześniej")}
                      </th>
                      <th className="py-1.5 pl-3 text-right font-medium">{tr("Zmiana")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastWeekDays.map((d) => {
                      const cur = d[metric];
                      const prev = d.tydzienWczesniej[metric];
                      return (
                        <tr key={d.date} className="border-t border-border/50">
                          <td className="py-1.5 pr-3 whitespace-nowrap">{axisLabel(d.date, 7)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums font-medium">{cur}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                            {prev}
                          </td>
                          <td className="py-1.5 pl-3 text-right">
                            <ChangeBadge value={change(cur, prev)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {data && !error && (
          <p className="text-[11px] text-muted-foreground">
            {length} {length === 1 ? tr("dzień") : "dni"} {tr(" · nowych kontaktów:")}{" "}
            <b className="text-foreground">{data.razem.nowe.toLocaleString(intlLocale())}</b>{" "}
            {tr(" · aktywnych osób: ")}{" "}
            <b className="text-foreground">{data.razem.aktywni.toLocaleString(intlLocale())}</b>
            {length >= MAX_RANGE_DAYS && tr(" · to największy dostępny zakres")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Zdanie podsumowania. Pasmo „stabilnie" pochodzi z `change()`, więc drobne
 * wahania nie są tu ogłaszane jako trend.
 */
function trendSentence(metric: Metric, c: Change): string {
  const what = metric === "nowe" ? tr("Nowych kontaktów") : tr("Aktywnych kontaktów");
  if (c.direction === "none") return tr("W obu tygodniach nie było danych do porównania.");
  if (c.isNew) return tr("{what} przybyło — tydzień wcześniej nie było żadnych.", { what: what });
  if (c.direction === "flat")
    return tr("{what} jest tyle samo co tydzień wcześniej ({v1}).", {
      what: what,
      v1: percentLabel(c),
    });
  if (c.direction === "up")
    return tr("{what} przybywa: {v1} tydzień do tygodnia.", { what: what, v1: percentLabel(c) });
  return tr("{what} ubywa: {v1} tydzień do tygodnia.", { what: what, v1: percentLabel(c) });
}

type ChartRow = PatientActivity["days"][number] & { label: string; porownanie: number };

function ActivityTooltip({
  active,
  payload,
  compare,
  metric,
  labelOf,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  compare: boolean;
  metric: Metric;
  labelOf: (key: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as ChartRow | undefined;
  if (!row) return null;
  const cur = row[metric];
  const prev = row.tydzienWczesniej[metric];

  return (
    <div
      className="rounded-xl border bg-background px-3 py-2 text-xs"
      style={{ borderColor: "oklch(0.92 0.012 240)", boxShadow: "var(--shadow-elevated)" }}
    >
      <p className="font-medium">{upperFirst(longDate(row.date))}</p>
      <div className="mt-1.5 space-y-0.5">
        {Object.entries(row.byStatus).map(([st, n]) => (
          <p key={st} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{labelOf(st)}</span>
            <span className="tabular-nums">{n}</span>
          </p>
        ))}
        <p className="flex justify-between gap-4 font-medium">
          <span>{tr("Nowe kontakty")}</span>
          <span className="tabular-nums">{row.nowe}</span>
        </p>
        <p className="flex justify-between gap-4 font-medium">
          <span>{tr("Aktywni")}</span>
          <span className="tabular-nums">{row.aktywni}</span>
        </p>
      </div>
      {compare && (
        <div className="mt-2 border-t pt-1.5">
          <p className="text-muted-foreground">
            {longDate(row.tydzienWczesniej.date)}: {prev}
          </p>
          <p className="flex items-center justify-between gap-4">
            <span>{METRIC_LABEL[metric]}</span>
            <ChangeBadge value={change(cur, prev)} />
          </p>
        </div>
      )}
    </div>
  );
}
