import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Loader2,
  Mail,
  MessageSquare,
  Newspaper,
  RefreshCw,
  Gauge,
  MoonStar,
  Paperclip,
  Send,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { BuilderKind, ContentItem } from "@/lib/content-builder";
import { getContentItems } from "@/lib/api/content-items.functions";
import {
  scheduleCampaign,
  getSegmentChoices,
  countSegmentNow,
} from "@/lib/api/campaigns.functions";
import { paceLabel, windowMinutes } from "@/lib/campaigns/throttle";
import { t as tr, localized } from "@/lib/i18n";

export const Route = createFileRoute("/send")({
  head: () => ({ meta: [{ title: tr("Wysyłka do segmentu — PRM Core") }] }),
  validateSearch: (search: Record<string, unknown>): { kind?: string; template?: string } => ({
    kind: typeof search.kind === "string" ? search.kind : undefined,
    template: typeof search.template === "string" ? search.template : undefined,
  }),
  component: SendPage,
});

const KIND_LABELS: Record<string, { title: string; back: string; icon: typeof Mail }> = localized(
  () => ({
    newsletter: { title: tr("Newsletter"), back: "/newsletter", icon: Newspaper },
    email: { title: tr("E-mail"), back: "/email", icon: Mail },
    sms: { title: "SMS", back: "/sms", icon: MessageSquare },
  }),
);

/**
 * `datetime-local` oddaje czas ścienny bez strefy. Przeglądarka w Polsce stoi
 * w tej samej strefie co klinika, więc `new Date(value)` czyta go poprawnie —
 * i to jest jedyny moment, w którym ta zgodność ma znaczenie.
 */
function toEpoch(local: string): number | null {
  if (!local) return null;
  const ms = new Date(local).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Puste pole znaczy „bez limitu"; śmieć w polu znaczy błąd, nie zero. */
function toLimit(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * Ile potrwa wysyłka przy tym tempie.
 *
 * Liczba, która najczęściej ratuje przed pomyłką: „600 odbiorców, 100 na
 * godzinę" brzmi rozsądnie, dopóki nie zobaczy się, że ostatni pacjent dostanie
 * wiadomość za sześć godzin — a przy limicie dobowym za kilka dni.
 */
function estimate(
  recipients: number,
  perHour: number | null,
  perDay: number | null,
  windowMin: number,
): string {
  // Okno godzin ścina dobę: przy 7:00–18:00 i 100/h w ciągu doby zmieści się
  // 1100 wiadomości, a nie 2400. Pominięcie tego dawałoby wynik zaniżony nawet
  // dwukrotnie — czyli obietnicę „jutro", gdy naprawdę jest pojutrze.
  const perDayEffective =
    perHour !== null
      ? Math.min(perDay ?? Infinity, Math.floor((perHour * windowMin) / 60))
      : perDay;

  const days = perDayEffective === null ? 1 : Math.ceil(recipients / perDayEffective);
  if (days > 1) return `${days} dni`;
  if (perHour === null) return "kilka minut";
  const hours = recipients / perHour;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  return tr("około {v0} h", {
    v0: hours < 2 ? hours.toFixed(1).replace(".", ",") : Math.round(hours),
  });
}

function SendPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const kind = (search.kind ?? "email") as BuilderKind;
  const templateName = search.template ?? "";
  const meta = KIND_LABELS[kind] ?? KIND_LABELS.email;
  const Icon = meta.icon;

  const [item, setItem] = useState<ContentItem | null>(null);
  const [loadingItem, setLoadingItem] = useState(Boolean(templateName));
  const [segmentsList, setSegmentsList] = useState<
    { id: string; name: string; members: number }[] | null
  >(null);
  const [segmentId, setSegmentId] = useState("");
  const [subject, setSubject] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [quiet, setQuiet] = useState(false);
  const [fromHour, setFromHour] = useState("07:00");
  const [toHour, setToHour] = useState("18:00");
  const [throttle, setThrottle] = useState(false);
  const [perHour, setPerHour] = useState("100");
  const [perDay, setPerDay] = useState("600");
  const [count, setCount] = useState<{ members: number; total: number } | null>(null);
  const [counting, setCounting] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Szablon czytany z BAZY, nie z przeglądarki. Wcześniej szedł
    // z `localStorage`, więc treść utworzona na innym komputerze była tu
    // niewidoczna i wysyłka z niego była niemożliwa.
    if (templateName) {
      setItem(null);
      setLoadingItem(true);
      getContentItems({ data: { kind } })
        .then((items) => setItem(items.find((i) => i.name === templateName) ?? null))
        .catch(() => setItem(null))
        .finally(() => setLoadingItem(false));
    }
    getSegmentChoices().then(setSegmentsList);
  }, [kind, templateName]);

  useEffect(() => {
    if (!segmentId) {
      setCount(null);
      return;
    }
    setCounting(true);
    countSegmentNow({ data: { segmentId } })
      .then((r) => setCount({ members: r.members, total: r.total }))
      .finally(() => setCounting(false));
  }, [segmentId]);

  const tags = useMemo(
    () =>
      tagsText
        .split(/[;,|]/)
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsText],
  );

  // Puste pole = ten limit nie obowiązuje. Można ustawić sam godzinowy, sam
  // dobowy albo oba — to trzy różne, sensowne polityki wysyłki.
  const hourLimit = throttle ? toLimit(perHour) : null;
  const dayLimit = throttle ? toLimit(perDay) : null;
  const limitsBroken =
    throttle &&
    ((perHour.trim() !== "" && hourLimit === null) || (perDay.trim() !== "" && dayLimit === null));
  const dayBelowHour = hourLimit !== null && dayLimit !== null && dayLimit < hourLimit;

  // Okno wysyłki obowiązuje tylko włączone i tylko z obiema godzinami — jedna
  // sama nic nie znaczy, a przepuszczona po cichu wyglądałaby jak działająca.
  const windowOn = quiet && fromHour !== "" && toHour !== "" && fromHour !== toHour;
  const sendFrom = windowOn ? fromHour : "";
  const sendTo = windowOn ? toHour : "";
  const quietBroken = quiet && (fromHour === "" || toHour === "" || fromHour === toHour);
  const overnight = windowOn && fromHour > toHour;

  const scheduledAt = when === "later" ? toEpoch(at) : null;
  const scheduleInPast = when === "later" && scheduledAt !== null && scheduledAt <= Date.now();

  const canSend =
    Boolean(item) &&
    Boolean(segmentId) &&
    !sending &&
    (kind === "sms" || subject.trim().length > 0) &&
    (when === "now" || (scheduledAt !== null && !scheduleInPast)) &&
    !limitsBroken &&
    !quietBroken;

  async function handleSend() {
    if (!item || !canSend) return;
    setSending(true);
    // Przekazujemy wyłącznie rodzaj i nazwę — treść, załączniki i renderowanie
    // do HTML-a robi serwer, czytając pozycję z bazy. Klient nie jest już
    // źródłem treści, więc wysyłka wygląda tak samo na każdym komputerze.
    const result = await scheduleCampaign({
      data: {
        kind: kind as "newsletter" | "email" | "sms",
        templateName: item.name,
        segmentId,
        subject: subject.trim(),
        tags,
        scheduledAt,
        sendFrom,
        sendTo,
        perHourLimit: hourLimit,
        perDayLimit: dayLimit,
      },
    });
    setSending(false);
    if (!result.ok) {
      toast.error(tr("Nie udało się zlecić wysyłki"), { description: result.error });
      return;
    }
    toast.success(
      scheduledAt
        ? tr("Wysyłka zaplanowana.")
        : tr("Wysyłka zlecona — ruszy w ciągu kilku sekund."),
      {
        description: windowOn
          ? tr(
              "Wysyłka tylko {sendFrom}–{sendTo}{v2}. Poza tymi godzinami stoi. Postęp w zakładce Wysyłki.",
              { sendFrom: sendFrom, sendTo: sendTo, v2: hourLimit ? `, ${hourLimit}/h` : "" },
            )
          : hourLimit
            ? tr("Tempo: {hourLimit}/h{v1}. Postęp zobaczysz w zakładce Wysyłki.", {
                hourLimit: hourLimit,
                v1: dayLimit ? tr(", maks. {dayLimit}/dobę", { dayLimit: dayLimit }) : "",
              })
            : scheduledAt
              ? tr("Odbiorcy zostaną przeliczeni minutę przed wysyłką.")
              : tr("Odbiorców w segmencie: {v0}.", { v0: count?.members ?? "?" }),
      },
    );
    navigate({ to: meta.back });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate({ to: meta.back })}
        >
          <ArrowLeft className="h-4 w-4" /> {meta.title}
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tr("Wyślij do segmentu")}</h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {templateName ? (
            <>
              {tr("Szablon: ")} <strong>{templateName}</strong>
            </>
          ) : (
            tr("Nie wskazano szablonu")
          )}
        </p>
      </div>

      {templateName && !item && !loadingItem && (
        <Card className="p-4 border-warning/40 bg-warning/10">
          <p className="text-sm">
            {tr("Nie ma szablonu „")}
            {templateName}
            {tr("” w module ")} {meta.title}
            {tr(". Sprawdź nazwę — być może został przemianowany albo usunięty.")}
          </p>
        </Card>
      )}

      <Card className="p-5 space-y-5 border-border/60 shadow-[var(--shadow-card)]">
        {/* ── segment ─────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label>{tr("Segment odbiorców *")}</Label>
          {!segmentsList ? (
            <p className="text-xs text-muted-foreground">{tr("Wczytywanie segmentów…")}</p>
          ) : segmentsList.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {tr("Nie ma jeszcze żadnego segmentu. Utwórz go w zakładce Segments.")}
            </p>
          ) : (
            <Select value={segmentId} onValueChange={setSegmentId}>
              <SelectTrigger>
                <SelectValue placeholder={tr("Wybierz segment…")} />
              </SelectTrigger>
              <SelectContent>
                {segmentsList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {segmentId && (
            <div className="flex items-center gap-2 pt-1 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              {counting ? (
                <span className="text-muted-foreground">{tr("przeliczam…")}</span>
              ) : (
                <>
                  <strong>{count?.members ?? 0}</strong>
                  <span className="text-muted-foreground">
                    {count ? tr(" z {total} kontaktów w bazie", { total: count.total }) : ""}
                  </span>
                  <button
                    type="button"
                    className="ml-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    onClick={() => setSegmentId((id) => id)}
                    title={tr("Przelicz ponownie")}
                  >
                    <RefreshCw className="h-3 w-3" /> {tr(" przelicz")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── tytuł ───────────────────────────────────────────────────── */}
        {kind !== "sms" && (
          <div className="space-y-1.5">
            <Label>{tr("Tytuł wiadomości *")}</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={tr("np. Zaproszenie na bezpłatne badanie słuchu")}
            />
            <p className="text-xs text-muted-foreground">
              {tr("To trafia w temat e-maila — pierwsza rzecz, którą pacjent zobaczy w skrzynce.")}
            </p>
          </div>
        )}

        {/* ── tagi ────────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label>{tr("Tagi dla odbiorców")}</Label>
          <Input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder={tr("np. kampania-sluch-2026, wrzesien")}
          />
          <p className="text-xs text-muted-foreground">
            {tr(
              "Doklejane każdemu, kto dostanie wiadomość. Po wysyłce da się z nich zbudować segment — na przykład żeby nie wysłać tego samego drugi raz.",
            )}
          </p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="font-normal">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* ── czas ────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label>{tr("Czas wysyłki")}</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={when === "now" ? "default" : "outline"}
              size="sm"
              onClick={() => setWhen("now")}
            >
              {tr("Teraz")}
            </Button>
            <Button
              type="button"
              variant={when === "later" ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setWhen("later")}
            >
              <CalendarClock className="h-4 w-4" /> {tr(" Zaplanuj")}
            </Button>
          </div>
          {when === "later" && (
            <>
              <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
              {scheduleInPast && (
                <p className="text-xs text-destructive">
                  {tr("Ten termin już minął — wybierz przyszły albo wyślij teraz.")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {tr("Treść zostanie zamrożona teraz, a")}{" "}
                <strong>{tr("odbiorcy przeliczeni minutę przed wysyłką")}</strong>
                {tr(
                  ". Kto do tego czasu wypisze się ze zgód, nie dostanie wiadomości; kto wejdzie do segmentu — dostanie.",
                )}
              </p>
            </>
          )}
        </div>

        {/* ── godziny wysyłki ─────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <MoonStar className="h-4 w-4" /> {tr(" Godziny wysyłki")}
          </Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={!quiet ? "default" : "outline"}
              size="sm"
              onClick={() => setQuiet(false)}
            >
              {tr("Cała doba")}
            </Button>
            <Button
              type="button"
              variant={quiet ? "default" : "outline"}
              size="sm"
              onClick={() => setQuiet(true)}
            >
              {tr("Tylko w wybranych godzinach")}
            </Button>
          </div>

          {!quiet ? (
            <p className="text-xs text-muted-foreground">
              {tr(
                "Wiadomości mogą wyjść o dowolnej porze — także w nocy. Przy SMS-ach to zwykle nie jest to, czego chcesz.",
              )}
            </p>
          ) : (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-normal text-muted-foreground">{tr("Od")}</Label>
                  <Input
                    type="time"
                    className="w-32"
                    value={fromHour}
                    onChange={(e) => setFromHour(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-normal text-muted-foreground">{tr("Do")}</Label>
                  <Input
                    type="time"
                    className="w-32"
                    value={toHour}
                    onChange={(e) => setToHour(e.target.value)}
                  />
                </div>
              </div>

              {quietBroken ? (
                <p className="text-xs text-destructive">
                  {tr("Podaj obie godziny i niech się różnią — inaczej okno nic nie ogranicza.")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {tr("Wysyłka pójdzie wyłącznie między ")} <strong>{sendFrom}</strong> {tr(" a")}{" "}
                  <strong>{sendTo}</strong> {tr(" czasu polskiego. Cisza obowiązuje od")}{" "}
                  <strong>{sendTo}</strong> {tr(" do ")} <strong>{sendFrom}</strong>{" "}
                  {tr(" — kampania nie kończy się wtedy, tylko czeka i wznawia się rano sama.")}
                </p>
              )}

              {overnight && (
                <p className="text-xs text-warning-foreground">
                  {tr("To okno przechodzi przez północ, więc wiadomości pójdą w nocy (")}
                  {sendFrom}–{sendTo}
                  {tr("). Jeśli chodziło o ciszę nocną, zamień godziny miejscami.")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── tempo wysyłki ───────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Gauge className="h-4 w-4" /> {tr(" Tempo wysyłki")}
          </Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={!throttle ? "default" : "outline"}
              size="sm"
              onClick={() => setThrottle(false)}
            >
              {tr("Bez ograniczeń")}
            </Button>
            <Button
              type="button"
              variant={throttle ? "default" : "outline"}
              size="sm"
              onClick={() => setThrottle(true)}
            >
              {tr("Ogranicz liczbę wiadomości")}
            </Button>
          </div>

          {!throttle ? (
            <p className="text-xs text-muted-foreground">
              {tr(
                "Wiadomości pójdą tak szybko, jak zdąży silnik — partiami po 25. Przy dużym segmencie warto ustawić limit: nagły skok wysyłki bywa czytany przez operatora SMS i filtry pocztowe jako spam.",
              )}
            </p>
          ) : (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-normal text-muted-foreground">
                    {tr("Maksymalnie na godzinę")}
                  </Label>
                  <Input
                    inputMode="numeric"
                    value={perHour}
                    onChange={(e) => setPerHour(e.target.value)}
                    placeholder={tr("np. 100")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-normal text-muted-foreground">
                    {tr("Maksymalnie na dobę")}
                  </Label>
                  <Input
                    inputMode="numeric"
                    value={perDay}
                    onChange={(e) => setPerDay(e.target.value)}
                    placeholder={tr("np. 600")}
                  />
                </div>
              </div>

              {limitsBroken ? (
                <p className="text-xs text-destructive">
                  {tr(
                    "Limit musi być liczbą całkowitą nie mniejszą niż 1. Zostaw pole puste, jeśli ten limit ma nie obowiązywać.",
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {hourLimit === null && dayLimit === null
                    ? tr("Oba pola puste — wysyłka pójdzie bez ograniczeń.")
                    : hourLimit !== null
                      ? tr(
                          'Wiadomości będą rozłożone równomiernie: {v0}. Limit nie znaczy „100 na raz, potem cisza".',
                          { v0: paceLabel(hourLimit) },
                        )
                      : tr(
                          "Bez limitu godzinowego wysyłka pójdzie pełną parą aż do wyczerpania limitu dobowego.",
                        )}
                </p>
              )}

              {dayBelowHour && (
                <p className="text-xs text-warning-foreground">
                  {tr(
                    "Limit dobowy jest niższy niż godzinowy — zadziała ten dobowy, a wysyłka wznowi się o północy. To poprawne, ale zwykle znaczy, że któraś liczba jest pomyłką.",
                  )}
                </p>
              )}

              {count && count.members > 0 && (hourLimit !== null || dayLimit !== null) && (
                <p className="text-xs">
                  <strong>{count.members}</strong> {tr(" odbiorców w tym tempie zajmie")}{" "}
                  <strong>
                    {estimate(count.members, hourLimit, dayLimit, windowMinutes(sendFrom, sendTo))}
                  </strong>
                  {tr(". Wysyłkę można w każdej chwili zatrzymać w zakładce Wysyłki.")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── załączniki ──────────────────────────────────────────────── */}
        {kind === "email" && (item?.attachments?.length ?? 0) > 0 && (
          <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <Paperclip className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <p>
              {tr("Do wiadomości pójdzie")}{" "}
              <strong>
                {item?.attachments?.length}{" "}
                {item?.attachments?.length === 1 ? tr("załącznik") : tr("załączników")}
              </strong>{" "}
              {tr("z modułu Media — te same pliki, co przy wysyłce testowej.")}
            </p>
          </div>
        )}

        {/* ── ostrzeżenie o pustym segmencie ──────────────────────────── */}
        {segmentId && count && count.members === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              {tr(
                "Ten segment jest w tej chwili pusty. Wysyłka zostanie zlecona, ale nikt jej nie dostanie, dopóki ktoś nie spełni warunków segmentu.",
              )}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1 border-t">
          <p className="text-xs text-muted-foreground">
            {tr(
              "Wiadomość dostaną wyłącznie kontakty ze zgodą marketingową na ten kanał. Reszta jest pomijana i policzona osobno.",
            )}
          </p>
          <Button
            className="gap-1.5 shrink-0"
            disabled={!canSend}
            onClick={() => void handleSend()}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {when === "later" ? tr("Zaplanuj wysyłkę") : tr("Wyślij teraz")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
