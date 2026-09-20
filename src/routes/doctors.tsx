import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Stethoscope, Info } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDoctors, toggleDoctorActive, type DoctorView } from "@/lib/api/doctors.functions";
import { intlLocale, t } from "@/lib/i18n";

export const Route = createFileRoute("/doctors")({
  head: () => ({
    meta: [
      { title: t("Lekarze i specjaliści — PRM Core") },
      {
        name: "description",
        content: t("Lista lekarzy placówki wraz z liczbą pacjentów zapisanych do każdego z nich."),
      },
    ],
  }),
  component: DoctorsPage,
});

function DoctorsPage() {
  const [list, setList] = useState<DoctorView[] | null>(null);
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("all");
  const [onlyActive, setOnlyActive] = useState(true);

  const refresh = () => getDoctors().then(setList);
  useEffect(() => {
    refresh();
  }, []);

  /**
   * Specjalizacje po `specKey`, ale wypisywane pod nazwą oryginalną — arkusz
   * miał „Chirurg Ogólny" i „Chirurg ogólny" jako osobne wiersze, a to jeden
   * zespół i jedna pozycja na liście.
   */
  const specs = useMemo(() => {
    const map = new Map<string, { label: string; n: number }>();
    for (const d of list ?? []) {
      const current = map.get(d.specKey);
      map.set(d.specKey, { label: current?.label ?? d.specialization, n: (current?.n ?? 0) + 1 });
    }
    return [...map.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, "pl"));
  }, [list]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list ?? []).filter((d) => {
      if (onlyActive && d.active !== 1) return false;
      if (spec !== "all" && d.specKey !== spec) return false;
      if (!needle) return true;
      return (
        d.name.toLowerCase().includes(needle) ||
        d.specialization.toLowerCase().includes(needle) ||
        d.services.some((s) => s.name.toLowerCase().includes(needle)) ||
        String(d.systemId).includes(needle)
      );
    });
  }, [list, q, spec, onlyActive]);

  /** Z której chwili są liczby o grafikach — bez tego „0 wolnych" wygląda na fakt, a bywa starym odczytem. */
  const slotsInfo = useMemo(() => {
    const synced = (list ?? []).filter((d) => d.slotsSyncedAt);
    if (synced.length === 0) return " · grafiki niezsynchronizowane";
    const newest = Math.max(...synced.map((d) => d.slotsSyncedAt ?? 0));
    const month = synced[0].slotsMonth;
    return ` · grafiki ${month}, odczyt ${new Date(newest).toLocaleString(intlLocale(), { dateStyle: "short", timeStyle: "short" })}`;
  }, [list]);

  const totals = useMemo(
    () => ({
      patients: filtered.reduce((acc, d) => acc + d.patients, 0),
      upcoming: filtered.reduce((acc, d) => acc + d.upcoming, 0),
    }),
    [filtered],
  );

  async function toggle(d: DoctorView) {
    setList((prev) =>
      (prev ?? []).map((x) => (x.id === d.id ? { ...x, active: d.active === 1 ? 0 : 1 } : x)),
    );
    try {
      await toggleDoctorActive({ data: { id: d.id, active: d.active !== 1 } });
    } catch {
      toast.error(t("Nie udało się zapisać zmiany."));
      refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {t("Lekarze i specjaliści")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {list === null
              ? t("Wczytywanie…")
              : t(
                  "{length} z {length2} · {length22} specjalizacji · {v3} zapisanych pacjentów{slotsInfo}",
                  {
                    length: filtered.length,
                    length2: list.length,
                    length22: specs.length,
                    v3: totals.patients.toLocaleString(intlLocale()),
                    slotsInfo: slotsInfo,
                  },
                )}
          </p>
        </div>
      </div>

      <Card className="border-border/60 shadow-[var(--shadow-card)] p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Szukaj po nazwisku, specjalizacji, usłudze lub ID…")}
              className="h-9 pl-9 bg-muted/40 border-transparent focus-visible:bg-background"
            />
          </div>
          <Select value={spec} onValueChange={setSpec}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Wszystkie specjalizacje")}</SelectItem>
              {specs.map(([key, s]) => (
                <SelectItem key={key} value={key}>
                  {s.label} ({s.n})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={onlyActive} onCheckedChange={setOnlyActive} />

            {t("Tylko przyjmujący")}
          </label>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>{t("Lekarz")}</TableHead>
                <TableHead>{t("Specjalizacja")}</TableHead>
                <TableHead>{t("Usługi")}</TableHead>
                <TableHead className="text-right">{t("Pacjentów")}</TableHead>
                <TableHead className="text-right">{t("Wizyt")}</TableHead>
                <TableHead className="text-right">{t("Nadchodzących")}</TableHead>
                <TableHead className="text-right">{t("Wolne sloty")}</TableHead>
                <TableHead className="text-right">{t("Obłożenie")}</TableHead>
                <TableHead className="text-right">{t("ID w systemie rezerwacji")}</TableHead>
                <TableHead className="w-24 text-right">{t("Przyjmuje")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list === null && (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {list !== null && filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    {t("Nikt nie pasuje do wyszukiwania.")}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((d) => (
                <TableRow key={d.id} className={d.active === 1 ? "" : "opacity-60"}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <Stethoscope className="h-4 w-4" />
                      </div>
                      {d.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {d.specialization}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    {d.services.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {d.services.slice(0, 2).map((s) => (
                          <span
                            key={s.id}
                            className="truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            title={t("{name} (IDX {id})", { name: s.name, id: s.id })}
                          >
                            {s.name.trim()}
                          </span>
                        ))}
                        {d.services.length > 2 && (
                          <span className="text-[11px] text-muted-foreground">
                            +{d.services.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {d.patients.toLocaleString(intlLocale())}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {d.visits.toLocaleString(intlLocale())}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {d.upcoming.toLocaleString(intlLocale())}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.occupancy === null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <span
                        title={t("{slotsBooked} z {slotsCapacity} zajętych", {
                          slotsBooked: d.slotsBooked,
                          slotsCapacity: d.slotsCapacity,
                        })}
                      >
                        {d.slotsFree.toLocaleString(intlLocale())}
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          / {d.slotsCapacity.toLocaleString(intlLocale())}
                        </span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.occupancy === null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      // Kolor po zapełnieniu: pełny grafik to nie jest sukces,
                      // tylko brak miejsca dla nowego pacjenta.
                      // Ponad 100% znaczy, że wizyt jest więcej niż wyliczonych
                      // slotów — grafik równoległy w dwóch gabinetach albo
                      // nadkomplet. Procent byłby wtedy liczbą bez znaczenia.
                      <span
                        className={
                          d.occupancy > 100
                            ? "font-medium text-destructive"
                            : d.occupancy >= 90
                              ? "font-medium text-destructive"
                              : d.occupancy >= 70
                                ? "font-medium text-[oklch(0.48_0.15_75)]"
                                : "text-success"
                        }
                        title={
                          d.occupancy > 100
                            ? t(
                                "{slotsBooked} wizyt przy {slotsCapacity} wyliczonych slotach — grafik równoległy albo nadkomplet",
                                { slotsBooked: d.slotsBooked, slotsCapacity: d.slotsCapacity },
                              )
                            : undefined
                        }
                      >
                        {d.occupancy > 100 ? "nadkomplet" : `${d.occupancy}%`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {d.systemId}
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch checked={d.active === 1} onCheckedChange={() => toggle(d)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Skąd biorą się liczby — bez tego „0 pacjentów" przy przyjmującym
          lekarzu wygląda na błąd, a jest brakiem danych. */}
      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-2.5 p-5 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-2">
            <p>
              <b className="text-foreground">{t('„Pacjentów" to liczba osób, nie wizyt.')}</b>{" "}
              {t(
                ' Jedna pacjentka na trzech wizytach liczy się raz — pytanie brzmi „ilu ludzi się zapisało". Kolumna „Wizyt" pokazuje drugą połowę tej odpowiedzi.',
              )}
            </p>
            <p>
              <b className="text-foreground">{t("Liczby idą z wizyt zapisanych w PRM Core")}</b>
              {t(
                ", nie z systemu rezerwacji na żywo — zapytanie o każdego lekarza przy każdym otwarciu listy dawałoby liczbę chwilową i wolną. Bez podłączonego systemu do bazy trafiają tylko rezerwacje online (webhook), więc wizyty umówione telefonicznie się nie liczą.",
              )}{" "}
              <b className="text-foreground">
                {t("Synchronizacja z systemem rezerwacji domyka ten licznik")}
              </b>{" "}
              {t("— pod warunkiem, że lekarze mają wpisany identyfikator z tego systemu.")}
            </p>
            <p>
              <b className="text-foreground">{t("Sloty są wyliczane, nie przysyłane.")}</b>{" "}
              {t(
                " Pojemność liczę z grafiku pracy: (godzina zamknięcia − otwarcia) ÷ czas badania. Lekarz przyjmujący równolegle w dwóch gabinetach albo przyjęty nadkomplet dają więcej wizyt niż wyliczonych slotów — wtedy zamiast procentu widać „nadkomplet”, bo liczba nie miałaby znaczenia. Kreska oznacza brak grafiku w tym miesiącu, nie zero wolnych miejsc.",
              )}
            </p>
            <p>
              {t(
                "Dopasowanie wizyty do lekarza idzie po nazwisku, bo webhook rezerwacji nie przysyła identyfikatora lekarza z systemu rezerwacji. To dopasowanie słabsze niż po ID i przy dwóch lekarzach o tym samym nazwisku może się pomylić.",
              )}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
