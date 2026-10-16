import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bot,
  Check,
  ClipboardCopy,
  Compass,
  Download,
  History,
  User,
  FlaskConical,
  FileText,
  Lightbulb,
  ListChecks,
  Loader2,
  Mail,
  MessageSquare,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  decideAgentDirection,
  approveAutomationMessages,
  decideAgentDraft,
  getAgentBrief,
  getAgentDirections,
  getAgentLog,
  getAgentEvaluation,
  runAgentEvaluation,
  getAdapterComparison,
  runAdapterComparison,
  type AdapterComparisonView,
  type AgentDirectionView,
  type AgentEvaluationView,
  getAgentDrafts,
  getAgentList,
  getAgentRecommendations,
  polishAgentBrief,
  rewriteAgentDraft,
  type AgentBriefView,
  type AgentDraftView,
  type AgentRecommendationView,
  type LanguageState,
} from "@/lib/api/agent.functions";
import type { AgentListRow, ListKey } from "@/lib/agent/drafts.server";
import { listReason } from "@/lib/agent/explain";
import { PatientSummary } from "@/components/contact/PatientSummary";
import { isReadOnlyRole } from "@/lib/auth/roles";
import { updateInsightStatus } from "@/lib/api/engine.functions";
import { intlLocale, localized, t } from "@/lib/i18n";

/**
 * PRM_Agent — the four things the agent hands to people: recommendations
 * (what it noticed and proposes), drafts (campaigns waiting for a decision),
 * lists (who to call today) and the brief (the week in one page). Everything
 * here is read from the installation's own database; nothing on this screen
 * sends a message — approval hands a campaign to the campaign runner, which
 * has its own throttle, quiet hours and consent gate.
 */

type Tab = "recommendations" | "drafts" | "lists" | "brief" | "directions" | "log";
const TABS: Tab[] = ["recommendations", "drafts", "lists", "brief", "directions", "log"];
const LIST_KEYS: ListKey[] = [
  "recall_due",
  "first_visit_no_followup",
  "post_visit_no_reply",
  "drifting",
  "high_risk",
  "no_phone",
];

export const Route = createFileRoute("/agent")({
  head: () => ({ meta: [{ title: t("PRM_Agent — PRM Core") }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: Tab; list?: ListKey } => ({
    tab: TABS.includes(search.tab as Tab) ? (search.tab as Tab) : undefined,
    list: LIST_KEYS.includes(search.list as ListKey) ? (search.list as ListKey) : undefined,
  }),
  component: AgentPage,
});

const LIST_LABELS: Record<ListKey, string> = localized(() => ({
  recall_due: t("Recall do zrobienia"),
  first_visit_no_followup: t("Pierwsza wizyta bez kolejnej"),
  post_visit_no_reply: t("Po wizycie, bez odpowiedzi"),
  drifting: t("Pacjenci dryfujący"),
  high_risk: t("Wizyty zagrożone nieobecnością"),
  no_phone: t("Bez telefonu"),
}));

const LIST_HINTS: Record<ListKey, string> = localized(() => ({
  recall_due: t("Ostatnia wizyta ponad rok temu i nic umówionego."),
  first_visit_no_followup: t("Jedna odbyta wizyta 1–12 miesięcy temu i nic umówionego."),
  post_visit_no_reply: t("Wizyta w ostatnich 7 dniach, brak odpowiedzi i nic umówionego."),
  drifting: t("Pół roku bez wizyty, bez otwartego e-maila i bez odpowiedzi."),
  high_risk: t("Nadchodzące wizyty z ryzykiem nieobecności co najmniej 30%, z czynnikami."),
  no_phone: t("Kontakty bez numeru telefonu — rejestracja dopyta przy najbliższym kontakcie."),
}));

const SEVERITY: Record<string, { label: string; className: string }> = localized(() => ({
  critical: { label: t("Pilne"), className: "bg-destructive/10 text-destructive" },
  warning: { label: t("Uwaga"), className: "bg-amber-500/10 text-amber-600" },
  info: { label: t("Propozycja"), className: "bg-primary/10 text-primary" },
}));

const DRAFT_STATUS: Record<string, { label: string; className: string }> = localized(() => ({
  proposed: { label: t("Czeka na decyzję"), className: "bg-amber-500/10 text-amber-600" },
  approved: { label: t("Zatwierdzony"), className: "bg-success/10 text-success" },
  handed_off: { label: t("Przekazany do wysyłki"), className: "bg-success/10 text-success" },
  rejected: { label: t("Odrzucony"), className: "bg-muted text-muted-foreground" },
}));

const pct = (v: number) => `${Math.round(v * 100)}%`;
function when(ms: number | null | undefined, withTime = false): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(intlLocale(), {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function AgentPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useRouteContext({ from: "__root__" });
  const readOnly = isReadOnlyRole(user?.role);
  const tab = search.tab ?? "recommendations";
  const [directions, setDirections] = useState<AgentDirectionView[]>([]);
  const loadDirections = useCallback(
    () =>
      getAgentDirections()
        .then(setDirections)
        .catch(() => setDirections([])),
    [],
  );
  useEffect(() => {
    void loadDirections();
  }, [loadDirections]);
  const pending = directions.filter((d) => d.status === "proposed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">PRM_Agent</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Analizuje, wyciąga wnioski, przygotowuje — decyzja należy do Ciebie. Dane pacjentów nie wychodzą poza tę instalację, a żadna wiadomość nie wychodzi bez zatwierdzenia.",
            )}
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => void navigate({ search: (s) => ({ ...s, tab: v as Tab }) })}
      >
        <TabsList className="flex flex-wrap h-auto bg-muted/40 p-1">
          <TabsTrigger value="recommendations" className="gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" /> {t("Rekomendacje")}
          </TabsTrigger>
          <TabsTrigger value="drafts" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" /> {t("Drafty")}
          </TabsTrigger>
          <TabsTrigger value="lists" className="gap-1.5">
            <ClipboardCopy className="h-3.5 w-3.5" /> {t("Listy")}
          </TabsTrigger>
          <TabsTrigger value="brief" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> {t("Brief")}
          </TabsTrigger>
          <TabsTrigger value="log" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> {t("Dziennik")}
          </TabsTrigger>
          <TabsTrigger value="directions" className="gap-1.5">
            <Compass className="h-3.5 w-3.5" /> {t("Kierunki")}
            {pending > 0 && (
              <span className="rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 leading-4">
                {pending}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="recommendations" className="mt-4">
          <RecommendationsTab readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="drafts" className="mt-4">
          <DraftsTab readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="lists" className="mt-4">
          <ListsTab
            listKey={search.list ?? "high_risk"}
            onChange={(list) => void navigate({ search: (s) => ({ ...s, tab: "lists", list }) })}
          />
        </TabsContent>
        <TabsContent value="brief" className="mt-4">
          <BriefTab readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="log" className="mt-4">
          <LogTab />
        </TabsContent>
        <TabsContent value="directions" className="mt-4">
          <DirectionsTab
            isAdmin={user?.role === "admin"}
            directions={directions}
            onChange={loadDirections}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── recommendations ─────────────────────────────────────────────────────────

function RecommendationsTab({ readOnly }: { readOnly: boolean }) {
  const [rows, setRows] = useState<AgentRecommendationView[] | null>(null);
  const load = useCallback(
    () =>
      getAgentRecommendations()
        .then(setRows)
        .catch(() => setRows([])),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const dismiss = async (id: string) => {
    try {
      await updateInsightStatus({ data: { id, status: "dismissed" } });
      toast.success(
        t(
          "Odrzucone. Z włączoną nauką agent wróci z tym dopiero, gdy liczby będą wyraźnie gorsze.",
        ),
      );
      await load();
    } catch (err) {
      toast.error(t("Nie udało się zapisać decyzji"), { description: String(err) });
    }
  };

  if (!rows) return <Loading />;
  if (rows.length === 0)
    return (
      <Empty>
        {t(
          "Nic pilnego. Rekomendacje pojawią się, gdy nocne liczenie sygnałów znajdzie coś, co odbiega od poprzedniego okresu.",
        )}
      </Empty>
    );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => {
        const sev = SEVERITY[r.severity] ?? SEVERITY.info;
        return (
          <Card key={r.id} className="border-border/60">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base leading-snug">{r.title}</CardTitle>
                <Badge variant="secondary" className={`shrink-0 ${sev.className}`}>
                  {sev.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{r.detail}</p>
              <p className="flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <span>{r.proposedAction}</span>
              </p>
              {Object.keys(r.evidence).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(r.evidence)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {k}: {v}
                      </span>
                    ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {t("Zauważone {when}", { when: when(r.updatedAt, true) })}
                </p>
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => void dismiss(r.id)}
                  >
                    <X className="h-3.5 w-3.5" /> {t("Odrzuć")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── drafts ──────────────────────────────────────────────────────────────────

function DraftsTab({ readOnly }: { readOnly: boolean }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAgentDrafts>> | null>(null);
  const load = useCallback(
    () =>
      getAgentDrafts()
        .then(setData)
        .catch(() =>
          setData({
            drafts: [],
            templates: { sms: [], email: [] },
            language: { available: false, mode: "off", reason: "" },
          }),
        ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <Loading />;
  const open = data.drafts.filter(
    (d) => d.status === "proposed" && d.kind !== "automation_message",
  );
  const held = data.drafts.filter(
    (d) => d.status === "proposed" && d.kind === "automation_message",
  );
  const decided = data.drafts.filter((d) => d.status !== "proposed");
  // Held messages grouped by automation: the team decides per automation, not per patient.
  const byAutomation = new Map<string, AgentDraftView[]>();
  for (const d of held) {
    const key = d.evidence.automationId ?? "";
    byAutomation.set(key, [...(byAutomation.get(key) ?? []), d]);
  }
  return (
    <div className="space-y-6">
      {[...byAutomation.entries()].map(([automationId, items]) => (
        <HeldMessages
          key={automationId}
          automationId={automationId}
          items={items}
          readOnly={readOnly}
          onDecided={load}
        />
      ))}
      {open.length === 0 && held.length === 0 ? (
        <Empty>
          {t(
            "Żaden draft nie czeka na decyzję. Agent proponuje kampanię, gdy za sygnałem stoi wystarczająco dużo pacjentów — np. recall dla 10 i więcej osób.",
          )}
        </Empty>
      ) : open.length === 0 ? null : (
        <div className="grid gap-4 lg:grid-cols-2">
          {open.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              templates={data.templates[d.channel]}
              language={data.language}
              readOnly={readOnly}
              onDecided={load}
            />
          ))}
        </div>
      )}
      {decided.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-2">{t("Rozstrzygnięte")}</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Draft")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Odbiorcy")}</TableHead>
                  <TableHead>{t("Decyzja")}</TableHead>
                  <TableHead>{t("Dalej")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decided.map((d) => {
                  const st = DRAFT_STATUS[d.status] ?? DRAFT_STATUS.rejected;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        <ChannelIcon channel={d.channel} /> {d.title}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={st.className}>
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell>{d.audienceCount}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {d.decidedBy} · {when(d.decidedAt, true)}
                        {d.note ? ` · ${d.note}` : ""}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {d.kind === "automation_message" ? (
                          d.status === "approved" ? (
                            t("Wysłane przez automatyzację — {who}", {
                              who: d.contact?.name ?? "—",
                            })
                          ) : (
                            t("Krok pominięty — {who}", { who: d.contact?.name ?? "—" })
                          )
                        ) : d.campaignId ? (
                          <Link to="/campaigns" className="text-primary hover:underline">
                            {t("Kampania w Wysyłkach")}
                          </Link>
                        ) : d.segmentName ? (
                          t("Segment „{name}” gotowy w Wysyłkach", { name: d.segmentName })
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

/** The held messages of one automation on trial: each one to approve or reject, or all at once. */
function HeldMessages({
  automationId,
  items,
  readOnly,
  onDecided,
}: {
  automationId: string;
  items: AgentDraftView[];
  readOnly: boolean;
  onDecided: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const name = items[0]?.evidence.automationName ?? "";
  const decide = async (id: string, decision: "approve" | "reject") => {
    setBusy(id);
    try {
      const r = await decideAgentDraft({ data: { id, decision } });
      if (!r.ok) toast.error(t("Nie udało się zapisać decyzji"), { description: r.error });
      else
        toast.success(
          decision === "approve"
            ? t("Zatwierdzone — wiadomość wyjdzie przy najbliższym przebiegu silnika.")
            : t("Odrzucone — automatyzacja pominie ten krok i pójdzie dalej."),
        );
      await onDecided();
    } finally {
      setBusy(null);
    }
  };
  const approveAll = async () => {
    setBusy("all");
    try {
      const r = await approveAutomationMessages({ data: { automationId } });
      toast.success(t("Zatwierdzono {n} wiadomości.", { n: r.approved }));
      await onDecided();
    } catch (err) {
      toast.error(t("Nie udało się zapisać decyzji"), { description: String(err) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-base">
            {t("Automatyzacja „{name}” w okresie próbnym", { name })}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              "{n} wiadomości czeka. Zatwierdzona wychodzi zwykłą drogą — ze sprawdzeniem zgód; odrzucona jest pomijana, a przebieg idzie dalej.",
              { n: items.length },
            )}
          </p>
        </div>
        {!readOnly && items.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0"
            disabled={!!busy}
            onClick={() => void approveAll()}
          >
            {busy === "all" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {t("Zatwierdź wszystkie ({n})", { n: items.length })}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((d) => (
          <div key={d.id} className="rounded-md border border-border p-3 text-sm space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">
                <ChannelIcon channel={d.channel} />
                {d.contact ? (
                  <Link
                    to="/contacts/$id"
                    params={{ id: d.contact.id }}
                    className="text-primary hover:underline"
                  >
                    {d.contact.name}
                  </Link>
                ) : (
                  "—"
                )}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  · {d.evidence.template}
                  {d.evidence.subject ? ` · ${d.evidence.subject}` : ""}
                </span>
              </div>
              {!readOnly && (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={!!busy}
                    onClick={() => void decide(d.id, "approve")}
                  >
                    <Check className="h-3.5 w-3.5" /> {t("Zatwierdź")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={!!busy}
                    onClick={() => void decide(d.id, "reject")}
                  >
                    <X className="h-3.5 w-3.5" /> {t("Odrzuć")}
                  </Button>
                </div>
              )}
            </div>
            <p className="whitespace-pre-wrap text-muted-foreground line-clamp-4">{d.message}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ChannelIcon({ channel }: { channel: "sms" | "email" }) {
  const Icon = channel === "sms" ? MessageSquare : Mail;
  return <Icon className="inline h-3.5 w-3.5 mr-1 text-muted-foreground align-[-2px]" />;
}

function DraftCard({
  draft,
  templates,
  language,
  readOnly,
  onDecided,
}: {
  draft: AgentDraftView;
  templates: string[];
  language: LanguageState;
  readOnly: boolean;
  onDecided: () => Promise<void>;
}) {
  const [message, setMessage] = useState(draft.message);
  const [source, setSource] = useState<"template" | "model">(draft.textSource);
  const [template, setTemplate] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "rewrite" | null>(null);
  const templateText = draft.templateMessage || draft.message;

  const rewrite = async () => {
    setBusy("rewrite");
    try {
      const r = await rewriteAgentDraft({ data: { id: draft.id } });
      if (!r.ok) {
        toast.error(t("Model nie napisał treści"), { description: r.error });
        return;
      }
      setMessage(r.message);
      setSource("model");
      toast.success(t("Treść napisana przez model — sprawdź ją przed zatwierdzeniem."));
    } catch (err) {
      toast.error(t("Model nie napisał treści"), { description: String(err) });
    } finally {
      setBusy(null);
    }
  };

  const decide = async (decision: "approve" | "reject") => {
    setBusy(decision);
    try {
      const r = await decideAgentDraft({
        data: {
          id: draft.id,
          decision,
          message,
          templateName: template || undefined,
          note: note || undefined,
        },
      });
      if (!r.ok) {
        toast.error(t("Nie udało się zapisać decyzji"), { description: r.error });
        return;
      }
      if (decision === "reject") toast.success(t("Draft odrzucony. Wróci najwcześniej za 14 dni."));
      else if (r.draft?.status === "handed_off")
        toast.success(t("Kampania przekazana do wysyłki"), {
          description: t(
            "Wysyłka rusza z limitami i bramką zgód Wysyłek — jak każda inna kampania.",
          ),
        });
      else
        toast.success(t("Draft zatwierdzony"), {
          description: t(
            "Segment „{name}” jest gotowy. Wybierz go w Wysyłkach z dowolnym szablonem.",
            { name: r.draft?.segmentName ?? "" },
          ),
        });
      await onDecided();
    } catch (err) {
      toast.error(t("Nie udało się zapisać decyzji"), { description: String(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base leading-snug">
              <ChannelIcon channel={draft.channel} />
              {draft.title}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {t("{n} odbiorców · zaproponowany {when}", {
                n: draft.audienceCount,
                when: when(draft.updatedAt),
              })}
            </p>
          </div>
          <Badge variant="secondary" className={DRAFT_STATUS.proposed.className}>
            {DRAFT_STATUS.proposed.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium">
              {t("Treść (z polami {{firstName}} itd.)")}
            </label>
            <span className="text-[11px] text-muted-foreground">
              {source === "model" ? t("napisał model w sieci placówki") : t("tekst z szablonu")}
            </span>
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            disabled={readOnly}
          />
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {language.available ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 h-7 px-2 text-xs"
                  disabled={!!busy}
                  onClick={() => void rewrite()}
                >
                  {busy === "rewrite" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {t("Napisz modelem")}
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">{language.reason}</span>
              )}
              {message !== templateText && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 h-7 px-2 text-xs"
                  disabled={!!busy}
                  onClick={() => {
                    setMessage(templateText);
                    setSource("template");
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  {t("Wróć do szablonu")}
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium">{t("Szablon do wysyłki")}</label>
            <Select
              value={template || "__none"}
              onValueChange={(v) => setTemplate(v === "__none" ? "" : v)}
              disabled={readOnly}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t("Bez szablonu — tylko segment")}</SelectItem>
                {templates.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {template
                ? t(
                    "Kampania wystartuje z tym opublikowanym szablonem — treść powyżej to podpowiedź dla jego autora.",
                  )
                : t(
                    "Powstanie segment z odbiorcami; kampanię uruchomisz w Wysyłkach, gdy szablon będzie gotowy.",
                  )}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t("Notatka (opcjonalnie)")}</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={readOnly} />
          </div>
        </div>
        {Object.keys(draft.evidence).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(draft.evidence)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {k}: {v}
                </span>
              ))}
          </div>
        )}
        {!readOnly && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!!busy}
              onClick={() => void decide("approve")}
            >
              {busy === "approve" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {t("Zatwierdź")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!!busy}
              onClick={() => void decide("reject")}
            >
              {busy === "reject" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              {t("Odrzuć")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── lists ───────────────────────────────────────────────────────────────────

function ListsTab({ listKey, onChange }: { listKey: ListKey; onChange: (k: ListKey) => void }) {
  const [rows, setRows] = useState<AgentListRow[] | null>(null);
  /** The row whose three-sentence summary is open — read before the call. */
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    setRows(null);
    getAgentList({ data: { key: listKey } })
      .then(setRows)
      .catch(() => setRows([]));
  }, [listKey]);
  const risk = listKey === "high_risk";

  const exportCsv = () => {
    if (!rows) return;
    const head = [
      t("Pacjent"),
      "PRM ID",
      t("Telefon"),
      "E-mail",
      t("Ostatnia wizyta"),
      t("Następna wizyta"),
    ];
    if (risk) head.push(t("Ryzyko"), t("Wizyta"), t("Lekarz"));
    head.push(t("Dlaczego"));
    const esc = (v: string | number | null | undefined) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r) => {
      const cells: (string | number | null | undefined)[] = [
        r.patient,
        r.prmId,
        r.phone,
        r.email,
        when(r.lastVisitAt),
        when(r.nextVisitAt, true),
      ];
      if (risk)
        cells.push(r.probability !== undefined ? pct(r.probability) : "", r.visitTitle, r.doctor);
      cells.push(listReason(listKey, r));
      return cells.map(esc).join(";");
    });
    const blob = new Blob(["﻿" + [head.map(esc).join(";"), ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `prm-agent-${listKey}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {LIST_KEYS.map((k) => (
          <Button
            key={k}
            size="sm"
            variant={k === listKey ? "default" : "outline"}
            onClick={() => onChange(k)}
          >
            {LIST_LABELS[k]}
          </Button>
        ))}
      </div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{LIST_HINTS[listKey]}</p>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0"
          disabled={!rows || rows.length === 0}
          onClick={exportCsv}
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
      </div>
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>{t("Nikogo na tej liście — albo sygnały nie były jeszcze liczone.")}</Empty>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Pacjent")}</TableHead>
                <TableHead>{t("Telefon")}</TableHead>
                <TableHead>E-mail</TableHead>
                {risk ? (
                  <>
                    <TableHead>{t("Wizyta")}</TableHead>
                    <TableHead>{t("Ryzyko")}</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>{t("Ostatnia wizyta")}</TableHead>
                    <TableHead>{t("Następna wizyta")}</TableHead>
                  </>
                )}
                <TableHead>{t("Dlaczego")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <Fragment key={`${r.contactId}-${i}`}>
                  <TableRow>
                    <TableCell>
                      <Link
                        to="/contacts/$id"
                        params={{ id: r.contactId }}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.patient}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">{r.prmId}</div>
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:underline"
                        aria-expanded={open === `${r.contactId}-${i}`}
                        onClick={() =>
                          setOpen(open === `${r.contactId}-${i}` ? null : `${r.contactId}-${i}`)
                        }
                      >
                        {open === `${r.contactId}-${i}` ? t("Zwiń") : t("Przed telefonem")}
                      </button>
                    </TableCell>
                    <TableCell>{r.phone || "—"}</TableCell>
                    <TableCell>{r.email || "—"}</TableCell>
                    {risk ? (
                      <>
                        <TableCell>
                          {when(r.nextVisitAt, true)}
                          <div className="text-[11px] text-muted-foreground">
                            {[r.visitTitle, r.doctor].filter(Boolean).join(" · ")}
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold">
                          {r.probability !== undefined ? pct(r.probability) : "—"}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{when(r.lastVisitAt)}</TableCell>
                        <TableCell>{when(r.nextVisitAt, true)}</TableCell>
                      </>
                    )}
                    <TableCell className="text-muted-foreground text-xs max-w-[320px]">
                      {listReason(listKey, r)}
                    </TableCell>
                  </TableRow>
                  {open === `${r.contactId}-${i}` && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={6}>
                        <PatientSummary contactId={r.contactId} className="max-w-3xl" />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── brief ───────────────────────────────────────────────────────────────────

function BriefTab({ readOnly }: { readOnly: boolean }) {
  const [brief, setBrief] = useState<AgentBriefView | null | undefined>(undefined);
  const [view, setView] = useState<"polished" | "template">("polished");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getAgentBrief()
      .then(setBrief)
      .catch(() => setBrief(null));
  }, []);
  if (brief === undefined) return <Loading />;
  if (!brief) return <Empty>{t("Brief powstanie po pierwszym nocnym liczeniu sygnałów.")}</Empty>;

  const showPolished = view === "polished" && !!brief.polished;
  const text = showPolished ? brief.polished : brief.text;

  const polish = async () => {
    setBusy(true);
    try {
      const r = await polishAgentBrief();
      if (!r.ok) {
        toast.error(t("Model nie wygładził briefu"), { description: r.error });
        return;
      }
      setBrief({ ...brief, polished: r.polished, model: r.model });
      setView("polished");
      toast.success(t("Brief wygładzony — każda liczba sprawdzona z wersją z szablonu."));
    } catch (err) {
      toast.error(t("Model nie wygładził briefu"), { description: String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-base">
            {t("Brief dla zarządu — {day}", { day: brief.day })}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {showPolished
              ? t(
                  "Wygładzony przez model w sieci placówki ({model}); każda liczba sprawdzona z wersją z szablonu.",
                  { model: brief.model },
                )
              : t(
                  "Z liczb tej instalacji, bez modelu językowego. Do wklejenia w e-mail albo na spotkanie.",
                )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 justify-end">
          {brief.polished && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setView(showPolished ? "template" : "polished")}
            >
              {showPolished ? t("Pokaż wersję z szablonu") : t("Pokaż wersję modelu")}
            </Button>
          )}
          {!readOnly && brief.language.available && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={busy}
              onClick={() => void polish()}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {t("Wygładź modelem")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              void navigator.clipboard
                .writeText(text)
                .then(() => toast.success(t("Skopiowano brief.")));
            }}
          >
            <ClipboardCopy className="h-3.5 w-3.5" /> {t("Kopiuj")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{text}</pre>
        {!brief.polished && !brief.language.available && brief.language.reason && (
          <p className="text-[11px] text-muted-foreground mt-3">{brief.language.reason}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── directions ──────────────────────────────────────────────────────────────

const DIRECTION_STATUS: Record<string, { label: string; className: string }> = localized(() => ({
  proposed: { label: t("Czeka na decyzję"), className: "bg-amber-500/10 text-amber-600" },
  enabled: { label: t("Włączony"), className: "bg-success/10 text-success" },
  declined: { label: t("Odrzucony"), className: "bg-muted text-muted-foreground" },
}));

function DirectionsTab({
  isAdmin,
  directions,
  onChange,
}: {
  isAdmin: boolean;
  directions: AgentDirectionView[];
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const decide = async (key: AgentDirectionView["key"], decision: "enable" | "decline") => {
    setBusy(key);
    try {
      const r = await decideAgentDirection({ data: { key, decision } });
      if (!r.ok) toast.error(t("Nie udało się zapisać decyzji"), { description: r.error });
      else if (key === "tuned_model")
        toast.success(
          decision === "enable"
            ? t("Agent używa teraz modelu dostrojonego.")
            : t("Agent wrócił do modelu bazowego."),
        );
      else
        toast.success(
          decision === "enable"
            ? t("Kierunek włączony — agent zacznie od najbliższego przebiegu.")
            : t("Kierunek odrzucony. Możesz go włączyć później na tej liście."),
        );
      await onChange();
    } catch (err) {
      toast.error(t("Nie udało się zapisać decyzji"), { description: String(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          "Agent rozwija się sam: co noc uczy model nieobecności na historii tej placówki, zapamiętuje, co zespół zatwierdził, i proponuje, co mógłby robić dalej. Każdy nowy kierunek czeka tu na decyzję administratora — nic nie rusza samo.",
        )}
      </p>
      <EvaluationCard isAdmin={isAdmin} onRan={onChange} />
      {directions.length === 0 ? (
        <Empty>
          {t(
            "Agent nie ma jeszcze propozycji. Pojawią się, gdy będzie miał podstawy — np. serwer modelu w sieci placówki, pierwszy zatwierdzony draft albo lukę w danych.",
          )}
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {directions.map((d) => {
            const st = DIRECTION_STATUS[d.status] ?? DIRECTION_STATUS.proposed;
            return (
              <Card key={d.key} className="border-border/60">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base leading-snug">{d.title}</CardTitle>
                    <Badge variant="secondary" className={`shrink-0 ${st.className}`}>
                      {st.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">{d.what}</p>
                  <p className="flex gap-2">
                    <Compass className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span>
                      {t("Dlaczego teraz: {why}", { why: d.why })}
                      {d.key !== "tuned_model" &&
                        Object.entries(d.evidence)
                          .filter(([, v]) => v)
                          .map(([k, v]) => ` · ${k}: ${v}`)
                          .join("")}
                    </span>
                  </p>
                  {d.key === "tuned_model" && (
                    <TunedModelPanel
                      // Reloaded with each decision: which model is in use follows it.
                      key={`${d.status}-${d.decidedAt ?? 0}`}
                      isAdmin={isAdmin}
                      decided={d.status !== "proposed" ? d.evidence : null}
                      onRan={onChange}
                    />
                  )}
                  {d.key === "tuned_model" && d.note && d.decidedBy === "PRM_Agent" && (
                    <p className="text-[11px] text-amber-600">{d.note}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {d.decidedAt
                      ? t("Decyzja: {who}, {when}", {
                          who: d.decidedBy,
                          when: when(d.decidedAt, true),
                        })
                      : t("Zaproponowany {when}", { when: when(d.proposedAt, true) })}
                  </p>
                  {isAdmin && (
                    <div className="flex gap-2 pt-1">
                      {d.status !== "enabled" && (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={busy === d.key}
                          onClick={() => void decide(d.key, "enable")}
                        >
                          <Check className="h-3.5 w-3.5" /> {t("Włącz")}
                        </Button>
                      )}
                      {d.status !== "declined" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={busy === d.key}
                          onClick={() => void decide(d.key, "decline")}
                        >
                          {d.key === "tuned_model" && d.status === "enabled" ? (
                            <Undo2 className="h-3.5 w-3.5" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}{" "}
                          {d.key === "tuned_model" && d.status === "enabled"
                            ? t("Wróć do modelu bazowego")
                            : d.status === "enabled"
                              ? t("Wyłącz")
                              : t("Odrzuć")}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The tuned model's gate: the last score of the base model and of the model
 * with this installation's adapter, side by side, and the button that runs
 * both. Enabling is refused on the server unless the tuned one is no worse.
 */
function TunedModelPanel({
  isAdmin,
  decided,
  onRan,
}: {
  isAdmin: boolean;
  /** The scores recorded with the last decision, when there was one. */
  decided: Record<string, string> | null;
  onRan: () => Promise<void>;
}) {
  const [data, setData] = useState<AdapterComparisonView | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      getAdapterComparison()
        .then(setData)
        .catch(() => setData(null)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!data) return null;

  const run = async () => {
    setBusy(true);
    try {
      const r = await runAdapterComparison();
      if (!r.ok) {
        toast.error(t("Porównanie nie zostało uruchomione"), { description: r.error });
        return;
      }
      toast.success(
        r.result.ok
          ? t("Porównanie zakończone: model dostrojony nie wypada gorzej — można go włączyć.")
          : t("Porównanie zakończone: {reason}", { reason: r.result.reason }),
      );
      await load();
      await onRan();
    } catch (err) {
      toast.error(t("Porównanie nie zostało uruchomione"), { description: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const cell = (label: string, model: string, s: AdapterComparisonView["base"]) => (
    <div className="rounded-md border border-border/60 p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{s ? `${s.passed}/${s.total}` : "—"}</div>
      <div className="text-[11px] text-muted-foreground break-all">
        {model || "—"}
        {s ? ` · ${when(s.runAt, true)}` : ""}
      </div>
    </div>
  );

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <div className="grid grid-cols-2 gap-2">
        {cell(t("Model bazowy"), data.baseModel, data.base)}
        {cell(t("Model dostrojony"), data.tunedModel, data.tuned)}
      </div>
      <p className={`text-xs ${data.ok ? "text-success" : "text-muted-foreground"}`}>
        {data.ok
          ? t("Model dostrojony wypada nie gorzej niż bazowy — można go włączyć.")
          : data.reason}
      </p>
      {decided?.base && decided.tuned && (
        <p className="text-[11px] text-muted-foreground">
          {t("Wyniki zapisane przy decyzji: bazowy {base}, dostrojony {tuned}.", {
            base: decided.base,
            tuned: decided.tuned,
          })}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {data.active ? t("W użyciu: model dostrojony.") : t("W użyciu: model bazowy.")}{" "}
        {t(
          "Adapter jest wytrenowany na danych tej placówki i zostaje w tej instalacji — nie jest udostępniany innym placówkom ani wysyłany poza serwer modelu.",
        )}
      </p>
      {isAdmin && data.configured && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={busy || !data.language.available}
          title={data.language.available ? "" : data.language.reason}
          onClick={() => void run()}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5" />
          )}
          {t("Porównaj modele")}
        </Button>
      )}
    </div>
  );
}

const FEATURE_LABELS: Record<string, string> = localized(() => ({
  draft: t("Drafty"),
  brief: t("Brief"),
  triage: t("Triaż"),
  reply: t("Odpowiedzi"),
}));

/** The evaluation harness: the last run, and the button that runs it against the model in reach. */
function EvaluationCard({ isAdmin, onRan }: { isAdmin: boolean; onRan: () => Promise<void> }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAgentEvaluation>> | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      getAgentEvaluation()
        .then(setData)
        .catch(() => setData(null)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!data) return null;

  const run = async () => {
    setBusy(true);
    try {
      const r = await runAgentEvaluation();
      if (!r.ok) {
        toast.error(t("Sprawdzian nie został uruchomiony"), { description: r.error });
        return;
      }
      toast.success(
        t("Sprawdzian zakończony: {passed} z {total} przypadków.", {
          passed: r.result.passed,
          total: r.result.total,
        }),
      );
      await load();
      await onRan();
    } catch (err) {
      toast.error(t("Sprawdzian nie został uruchomiony"), { description: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const last: AgentEvaluationView | null = data.last;
  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            {t("Sprawdzian modelu")}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              "{n} stałych przypadków — drafty, brief, triaż, w tym pułapki (porada medyczna, wymyślony link, zmieniona liczba). Model w sieci placówki odpowiada, kod ocenia. Uruchom przed włączeniem kierunku i po zmianie modelu.",
              { n: data.cases },
            )}
          </p>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0"
            disabled={busy || !data.language.available}
            title={data.language.available ? "" : data.language.reason}
            onClick={() => void run()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5" />
            )}
            {t("Uruchom sprawdzian")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!last ? (
          <p className="text-muted-foreground">
            {data.language.available
              ? t("Jeszcze nie uruchomiono.")
              : t("Potrzebny model w sieci placówki: {reason}", { reason: data.language.reason })}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl font-semibold">
                {last.passed}/{last.total}
              </span>
              {Object.entries(last.byFeature).map(([f, v]) => (
                <Badge key={f} variant="secondary" className="font-normal">
                  {FEATURE_LABELS[f] ?? f}: {v.passed}/{v.total}
                </Badge>
              ))}
              <span className="text-[11px] text-muted-foreground">
                {t("{model} · {when} · {who}", {
                  model: last.model,
                  when: when(last.runAt, true),
                  who: last.startedBy,
                })}
              </span>
            </div>
            {last.failed.length > 0 && (
              <ul className="space-y-1.5">
                {last.failed.map((f) => (
                  <li
                    key={f.id}
                    className="rounded-md border border-destructive/30 bg-destructive/5 p-2"
                  >
                    <div className="font-medium">
                      {f.title}{" "}
                      <span className="text-muted-foreground font-normal">· {f.reason}</span>
                    </div>
                    {f.output && (
                      <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {f.output}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── the log ─────────────────────────────────────────────────────────────────

type Actor = "person" | "agent" | "model";
type LogRow = Awaited<ReturnType<typeof getAgentLog>>[number];

const ACTOR: Record<Actor, { label: string; className: string }> = localized(() => ({
  person: { label: t("Osoba"), className: "bg-success/10 text-success" },
  agent: { label: t("Agent"), className: "bg-primary/10 text-primary" },
  model: { label: t("Model"), className: "bg-muted text-muted-foreground" },
}));

/**
 * Every decision about the agent's work, newest first: what the agent did on
 * its own rules, what a person decided, what a model was asked. Each line
 * says where to look next.
 */
function LogTab() {
  const [actor, setActor] = useState<Actor | "all">("all");
  const [rows, setRows] = useState<LogRow[] | null>(null);
  useEffect(() => {
    setRows(null);
    getAgentLog({ data: { actor } })
      .then(setRows)
      .catch(() => setRows([]));
  }, [actor]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          "Każda decyzja wokół agenta: co zrobił sam według reguł, co zdecydowała osoba (z nazwiskiem), o co zapytano model w sieci placówki. Ostatnie 200 wpisów.",
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {(["all", "person", "agent", "model"] as const).map((a) => (
          <Button
            key={a}
            size="sm"
            variant={a === actor ? "default" : "outline"}
            onClick={() => setActor(a)}
          >
            {a === "all" ? t("Wszystko") : a === "person" ? t("Decyzje ludzi") : ACTOR[a].label}
          </Button>
        ))}
      </div>
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>{t("Brak wpisów.")}</Empty>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="w-32 shrink-0 text-[11px] text-muted-foreground pt-0.5">
                {when(r.createdAt, true)}
              </span>
              <Badge
                variant="secondary"
                className={`shrink-0 font-normal ${ACTOR[r.actor].className}`}
              >
                {r.actor === "person" && <User className="h-3 w-3 mr-1" />}
                {ACTOR[r.actor].label}
              </Badge>
              <span className="flex-1 min-w-[240px]">
                {r.message}
                <span className="ml-2 inline-flex flex-wrap gap-x-2 text-xs">
                  {r.contactId && r.contactName && (
                    <Link
                      to="/contacts/$id"
                      params={{ id: r.contactId }}
                      className="text-primary hover:underline"
                    >
                      {r.contactName}
                    </Link>
                  )}
                  {r.automationName && (
                    <Link to="/automation" className="text-primary hover:underline">
                      {r.automationName}
                    </Link>
                  )}
                  {r.draftId && (
                    <Link
                      to="/agent"
                      search={{ tab: "drafts" }}
                      className="text-primary hover:underline"
                    >
                      {t("Drafty")}
                    </Link>
                  )}
                  {r.directionKey && (
                    <Link
                      to="/agent"
                      search={{ tab: "directions" }}
                      className="text-primary hover:underline"
                    >
                      {t("Kierunki")}
                    </Link>
                  )}
                  {r.threadId && (
                    <Link
                      to="/inbox"
                      search={{ thread: r.threadId }}
                      className="text-primary hover:underline"
                    >
                      {t("Rozmowa")}
                    </Link>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── bits ────────────────────────────────────────────────────────────────────

function Loading() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
      <Loader2 className="h-4 w-4 animate-spin" /> {t("Wczytywanie…")}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
