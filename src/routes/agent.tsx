import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bot,
  Check,
  ClipboardCopy,
  Download,
  FileText,
  Lightbulb,
  ListChecks,
  Loader2,
  Mail,
  MessageSquare,
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
  decideAgentDraft,
  getAgentBrief,
  getAgentDrafts,
  getAgentList,
  getAgentRecommendations,
  type AgentDraftView,
  type AgentRecommendationView,
} from "@/lib/api/agent.functions";
import type { AgentListRow, ListKey } from "@/lib/agent/drafts.server";
import { factorLabel } from "@/lib/agent/factor-labels";
import { isReadOnlyRole } from "@/lib/auth/roles";
import { intlLocale, localized, t } from "@/lib/i18n";

/**
 * PRM_Agent — the four things the agent hands to people: recommendations
 * (what it noticed and proposes), drafts (campaigns waiting for a decision),
 * lists (who to call today) and the brief (the week in one page). Everything
 * here is read from the installation's own database; nothing on this screen
 * sends a message — approval hands a campaign to the campaign runner, which
 * has its own throttle, quiet hours and consent gate.
 */

type Tab = "recommendations" | "drafts" | "lists" | "brief";
const TABS: Tab[] = ["recommendations", "drafts", "lists", "brief"];
const LIST_KEYS: ListKey[] = [
  "recall_due",
  "first_visit_no_followup",
  "post_visit_no_reply",
  "drifting",
  "high_risk",
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
}));

const LIST_HINTS: Record<ListKey, string> = localized(() => ({
  recall_due: t("Ostatnia wizyta ponad rok temu i nic umówionego."),
  first_visit_no_followup: t("Jedna odbyta wizyta 1–12 miesięcy temu i nic umówionego."),
  post_visit_no_reply: t("Wizyta w ostatnich 7 dniach, brak odpowiedzi i nic umówionego."),
  drifting: t("Pół roku bez wizyty, bez otwartego e-maila i bez odpowiedzi."),
  high_risk: t("Nadchodzące wizyty z ryzykiem nieobecności co najmniej 30%, z czynnikami."),
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
        </TabsList>
        <TabsContent value="recommendations" className="mt-4">
          <RecommendationsTab />
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
          <BriefTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── recommendations ─────────────────────────────────────────────────────────

function RecommendationsTab() {
  const [rows, setRows] = useState<AgentRecommendationView[] | null>(null);
  useEffect(() => {
    getAgentRecommendations()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

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
              <p className="text-[11px] text-muted-foreground">
                {t("Zauważone {when}", { when: when(r.updatedAt, true) })}
              </p>
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
        .catch(() => setData({ drafts: [], templates: { sms: [], email: [] } })),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <Loading />;
  const open = data.drafts.filter((d) => d.status === "proposed");
  const decided = data.drafts.filter((d) => d.status !== "proposed");
  return (
    <div className="space-y-6">
      {open.length === 0 ? (
        <Empty>
          {t(
            "Żaden draft nie czeka na decyzję. Agent proponuje kampanię, gdy za sygnałem stoi wystarczająco dużo pacjentów — np. recall dla 10 i więcej osób.",
          )}
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {open.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              templates={data.templates[d.channel]}
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
                        {d.campaignId ? (
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

function ChannelIcon({ channel }: { channel: "sms" | "email" }) {
  const Icon = channel === "sms" ? MessageSquare : Mail;
  return <Icon className="inline h-3.5 w-3.5 mr-1 text-muted-foreground align-[-2px]" />;
}

function DraftCard({
  draft,
  templates,
  readOnly,
  onDecided,
}: {
  draft: AgentDraftView;
  templates: string[];
  readOnly: boolean;
  onDecided: () => Promise<void>;
}) {
  const [message, setMessage] = useState(draft.message);
  const [template, setTemplate] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

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
          <label className="text-xs font-medium">{t("Treść (z polami {{firstName}} itd.)")}</label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            disabled={readOnly}
          />
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
    if (risk) head.push(t("Ryzyko"), t("Czynniki"), t("Wizyta"), t("Lekarz"));
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
        cells.push(
          r.probability !== undefined ? pct(r.probability) : "",
          factorsText(r),
          r.visitTitle,
          r.doctor,
        );
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
                    <TableHead>{t("Czynniki")}</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>{t("Ostatnia wizyta")}</TableHead>
                    <TableHead>{t("Następna wizyta")}</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.contactId}-${i}`}>
                  <TableCell>
                    <Link
                      to="/contacts/$id"
                      params={{ id: r.contactId }}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.patient}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">{r.prmId}</div>
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
                      <TableCell className="text-muted-foreground text-xs">
                        {factorsText(r)}
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{when(r.lastVisitAt)}</TableCell>
                      <TableCell>{when(r.nextVisitAt, true)}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function factorsText(r: AgentListRow): string {
  return (r.factors ?? []).map((f) => factorLabel(f.feature, f.contribution > 0)).join(", ");
}

// ── brief ───────────────────────────────────────────────────────────────────

function BriefTab() {
  const [brief, setBrief] = useState<{ day: string; text: string } | null | undefined>(undefined);
  useEffect(() => {
    getAgentBrief()
      .then(setBrief)
      .catch(() => setBrief(null));
  }, []);
  if (brief === undefined) return <Loading />;
  if (!brief) return <Empty>{t("Brief powstanie po pierwszym nocnym liczeniu sygnałów.")}</Empty>;
  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-base">
            {t("Brief dla zarządu — {day}", { day: brief.day })}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              "Z liczb tej instalacji, bez modelu językowego. Do wklejenia w e-mail albo na spotkanie.",
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0"
          onClick={() => {
            void navigator.clipboard
              .writeText(brief.text)
              .then(() => toast.success(t("Skopiowano brief.")));
          }}
        >
          <ClipboardCopy className="h-3.5 w-3.5" /> {t("Kopiuj")}
        </Button>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{brief.text}</pre>
      </CardContent>
    </Card>
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
