import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Play,
  Pause,
  Zap,
  Users,
  List,
  Workflow,
  Bot,
  BarChart3,
  Gauge,
  ArrowLeft,
  Search,
  MoreHorizontal,
  Send,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Eye,
  MousePointerClick,
  Save,
  Pencil,
  Check,
  AlertTriangle,
  Loader2,
  History,
  PlayCircle,
  Copy,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AutomationBuilder } from "@/components/automation/AutomationBuilder";
import { NewAutomationDialog } from "@/components/automation/NewAutomationDialog";
import { CreateAutomationNameDialog } from "@/components/automation/CreateAutomationNameDialog";
import { nodeId, validateGraph, type AutomationStatus } from "@/lib/automation-flow";
import { triggerLabel } from "@/lib/automation-catalog";
import { newDraftRecord, type AutomationRecord } from "@/lib/automation-records";
import { getContentItemNames } from "@/lib/api/content-items.functions";
import { generateAutomationFlow } from "@/lib/api/ai.functions";
import {
  deleteAutomation,
  getAllAutomations,
  saveAutomation,
} from "@/lib/api/automation.functions";
import {
  getAutomationKpis,
  getRunCounts,
  publishEngineTemplates,
  type AutomationKpis,
} from "@/lib/api/engine.functions";
import { collectTemplateRefs } from "@/lib/engine/publish-templates";
import { EnginePanel } from "@/components/automation/EnginePanel";
import { SupervisorPanel } from "@/components/automation/SupervisorPanel";
import { RunHistorySheet } from "@/components/automation/RunHistorySheet";
import { DryRunDialog } from "@/components/automation/DryRunDialog";
import { intlLocale, t as tr } from "@/lib/i18n";

const TAB_IDS = ["list", "builder", "ai", "engine", "stats"] as const;

export const Route = createFileRoute("/automation")({
  head: () => ({ meta: [{ title: tr("Automation — PRM Core") }] }),
  /**
   * Which tab to open, in the URL rather than only in component state.
   *
   * Without this the TopBar bell could navigate here but never reach the
   * supervisor panel, which lives under "PRM Engine" — you always landed on the
   * list and it looked like the bell did nothing. It also makes a tab
   * linkable and survivable across a reload.
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: (typeof TAB_IDS)[number]; focus?: "insights" } => {
    const tab = String(search.tab ?? "");
    return {
      ...(TAB_IDS.includes(tab as (typeof TAB_IDS)[number])
        ? { tab: tab as (typeof TAB_IDS)[number] }
        : {}),
      // Set only by the bell: scroll past the engine counters to the findings
      // the user actually clicked through for.
      ...(search.focus === "insights" ? { focus: "insights" as const } : {}),
    };
  },
  component: AutomationPage,
});

function StatusBadge({ status }: { status: AutomationStatus }) {
  if (status === "active") {
    return (
      <Badge
        variant="outline"
        className="bg-success/10 text-success border-success/20 uppercase text-[10px] tracking-wider"
      >
        <Play className="h-3 w-3 mr-1" /> {tr(" Aktywna")}
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge
        variant="outline"
        className="bg-muted text-muted-foreground uppercase text-[10px] tracking-wider"
      >
        <Pencil className="h-3 w-3 mr-1" /> {tr(" Wersja robocza")}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="bg-warning/15 text-warning-foreground border-warning/30 uppercase text-[10px] tracking-wider"
    >
      <Pause className="h-3 w-3 mr-1" /> {tr(" Nieaktywna")}
    </Badge>
  );
}

function AutomationPage() {
  const [records, setRecords] = useState<AutomationRecord[]>([]);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { tab: tabFromUrl, focus } = Route.useSearch();
  const [activeTab, setActiveTab] = useState(tabFromUrl ?? "list");
  const insightsRef = useRef<HTMLDivElement | null>(null);
  /** Builder edit mode. Off by default, and impossible while the automation is active. */
  const [editingFlow, setEditingFlow] = useState(false);

  // Following the bell while already on this page changes only the search
  // param, so the tab has to react to it rather than just seed from it once.
  useEffect(() => {
    if (tabFromUrl) setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  // Arriving from the bell: the supervisor panel sits below the engine
  // counters, and someone chasing a critical alert should not have to hunt for
  // it. Only on `focus=insights`, so opening the tab by hand doesn't jump.
  useEffect(() => {
    if (focus !== "insights" || activeTab !== "engine") return;
    const id = setTimeout(
      () => insightsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      150,
    );
    return () => clearTimeout(id);
  }, [focus, activeTab]);
  const [newAutomationOpen, setNewAutomationOpen] = useState(false);
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  // Tracks the draft created via "Nowa automatyzacja" -> "Agent AI" specifically, so that
  // generating from the AI tab never silently overwrites an unrelated automation that
  // happens to be loaded in the builder (e.g. from a previous list click).
  const [aiDraftId, setAiDraftId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [renameTarget, setRenameTarget] = useState<AutomationRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationRecord | null>(null);
  // Real number of contacts that have entered each automation, from
  // automation_runs — replaces the mocked `users` column on the record.
  const [runCounts, setRunCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    getAllAutomations().then((list) => {
      setRecords(list);
      setRecordsLoaded(true);

      // Migawki na serwerze zestarzałyby się w chwili, gdy ktoś poprawi
      // szablon w module E-mail albo SMS. Przy każdym wejściu publikujemy je
      // ponownie, żeby to, co wysyła silnik, zgadzało się z tym, co pokazuje
      // kreator. Przeglądarka podaje wyłącznie nazwy — treść serwer czyta
      // sobie sam z bazy.
      const active = list.filter((r) => r.status === "active");
      if (active.length === 0) return;
      const templates = active.flatMap((r) => collectTemplateRefs(r.flow));
      if (templates.length === 0) return;
      publishEngineTemplates({
        data: { baseUrl: window.location.origin, templates },
      }).catch(() => {
        /* activation re-publishes anyway — a failed refresh must not block the page */
      });
    });
  }, []);

  const refreshRunCounts = () => {
    getRunCounts()
      .then(setRunCounts)
      .catch(() => {
        /* the list is still usable without live counters */
      });
  };

  useEffect(() => {
    refreshRunCounts();
    const id = setInterval(refreshRunCounts, 6000);
    return () => clearInterval(id);
  }, []);

  const currentRecord = records.find((r) => r.id === currentId) ?? null;

  const needle = query.trim().toLowerCase();
  const visibleRecords = needle
    ? records.filter((r) =>
        [r.name, triggerLabel(r.flow)].some((field) => field.toLowerCase().includes(needle)),
      )
    : records;

  const updateRecord = (id: string, patch: Partial<AutomationRecord>) => {
    setRecords((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      const updated = next.find((r) => r.id === id);
      if (updated) saveAutomation({ data: updated });
      return next;
    });
  };

  /** New records (drafts) need an explicit first save — updateRecord() only patches existing rows. */
  const persistNewRecord = (record: AutomationRecord) => {
    saveAutomation({ data: record });
  };

  const attemptSetActive = async (id: string, wantActive: boolean) => {
    if (!wantActive) {
      updateRecord(id, { status: "inactive" });
      toast.success(tr("Automatyzacja wyłączona"), {
        description: tr("Trwające przebiegi zatrzymają się przy najbliższym kroku."),
      });
      return;
    }
    const rec = records.find((r) => r.id === id);
    const { valid, errors } = validateGraph(rec?.flow ?? null);
    if (!valid) {
      toast.error(tr("Nie można aktywować automatyzacji"), { description: errors.join(" ") });
      return;
    }

    // Aktywacja jest też momentem, w którym serwer robi migawkę każdego
    // szablonu, który ta automatyzacja wysyła — bez tego silnik doszedłby do
    // kroku wysyłki, nie mając czym wysłać. Brakujące rozpoznaje serwer,
    // czytając bazę, więc „brakuje" znaczy naprawdę brakuje, a nie „nie ma
    // tego w tej przeglądarce".
    const templates = collectTemplateRefs(rec?.flow ?? null);
    let missing: string[] = [];
    try {
      const published = await publishEngineTemplates({
        data: { baseUrl: window.location.origin, templates },
      });
      missing = published.missing ?? [];
    } catch (err) {
      toast.error(tr("Nie udało się wysłać szablonów na serwer"), { description: String(err) });
      return;
    }

    updateRecord(id, { status: "active" });
    if (missing.length > 0) {
      toast.warning(tr("Automatyzacja aktywna, ale brakuje szablonów"), {
        description: tr(
          "Nie znaleziono: {v0}. Kroki wysyłki zakończą się błędem, dopóki szablony nie wrócą.",
          { v0: missing.join(", ") },
        ),
      });
    } else {
      toast.success(tr("Automatyzacja aktywna"), {
        description:
          templates.length > 0
            ? tr("PRM Engine dostał {length} {v1} do wysyłki.", {
                length: templates.length,
                v1: templates.length === 1 ? "szablon" : tr("szablonów"),
              })
            : tr("PRM Engine nasłuchuje na wyzwalacz."),
      });
    }
  };

  const openAutomation = (id: string) => {
    setCurrentId(id);
    setActiveTab("builder");
    setAiDraftId(null);
    // Opening a scenario always starts in read-only. Edit mode is per-visit and
    // must not carry over from the automation you were just editing.
    setEditingFlow(false);
  };

  const handleChooseBuilder = () => {
    const draft = newDraftRecord();
    setRecords((prev) => [draft, ...prev]);
    persistNewRecord(draft);
    setCurrentId(draft.id);
    setActiveTab("builder");
    setNewAutomationOpen(false);
    setNamePromptOpen(true);
    setAiDraftId(null);
    // A brand-new scenario is empty and draft — there is nothing to protect and
    // everything to build, so it opens ready to edit.
    setEditingFlow(true);
  };

  const handleChooseAi = () => {
    const draft = newDraftRecord();
    setRecords((prev) => [draft, ...prev]);
    persistNewRecord(draft);
    setCurrentId(draft.id);
    setActiveTab("ai");
    setNewAutomationOpen(false);
    setAiDraftId(draft.id);
  };

  const handleNameSubmit = (name: string) => {
    if (currentId) updateRecord(currentId, { name });
  };

  // Landing on "Wizualny builder" with nothing selected (e.g. clicking the tab directly
  // instead of going through "Nowa automatyzacja") starts the same create-automation flow.
  const handleDuplicate = (record: AutomationRecord) => {
    const copy: AutomationRecord = {
      ...record,
      id: nodeId("auto"),
      name: `${record.name || "Bez nazwy"} (kopia)`,
      // A copy always starts switched off: duplicating a live automation must
      // not silently double every message its original sends.
      status: "draft",
      // Deep copy so editing the duplicate's graph cannot reach into the original.
      flow: record.flow ? structuredClone(record.flow) : null,
    };
    setRecords((prev) => [copy, ...prev]);
    persistNewRecord(copy);
    toast.success(tr("Utworzono kopię"), {
      description: tr("„{name}” zapisano jako wersję roboczą.", { name: copy.name }),
    });
  };

  const handleDelete = async (record: AutomationRecord) => {
    setDeleteTarget(null);
    setRecords((prev) => prev.filter((r) => r.id !== record.id));
    if (currentId === record.id) {
      setCurrentId(null);
      setActiveTab("list");
    }
    try {
      await deleteAutomation({ data: { id: record.id } });
      toast.success(tr("Automatyzacja usunięta"), {
        description: tr("Historia jej przebiegów zostaje na kartach pacjentów."),
      });
    } catch (err) {
      toast.error(tr("Nie udało się usunąć automatyzacji"), { description: String(err) });
      // Put it back rather than leave the list showing a delete that never happened.
      setRecords((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
    }
  };

  const handleTabChange = (tab: string) => {
    if (tab === "builder" && !currentId) {
      handleChooseBuilder();
      return;
    }
    setActiveTab(tab as (typeof TAB_IDS)[number]);
    // Keep the address in step with the tab, so a reload or a shared link lands
    // where the user actually is.
    navigate({
      to: "/automation",
      search: { tab: tab as (typeof TAB_IDS)[number] },
      replace: true,
    });
  };

  const handleGenerate = async (prompt: string) => {
    // Nazwy szablonów jadą razem z poleceniem, żeby model nie wymyślił kroku
    // wysyłki wskazującego na szablon, którego nie ma. Lista pochodzi z bazy,
    // więc jest ta sama niezależnie od komputera.
    const templates = await getContentItemNames({
      data: { kinds: ["email", "newsletter", "sms", "popup"] },
    }).catch(() => ({}) as Record<string, string[]>);

    const result = await generateAutomationFlow({ data: { prompt, templates } });
    if (!result.ok || !result.graph) {
      toast.error(tr("Nie udało się wygenerować scenariusza"), { description: result.error });
      return;
    }

    const name = result.name ?? prompt.slice(0, 48);
    const flow = result.graph;
    const target = aiDraftId ? records.find((r) => r.id === aiDraftId) : null;
    if (target) {
      updateRecord(target.id, { name, flow });
      setCurrentId(target.id);
    } else {
      const rec: AutomationRecord = { ...newDraftRecord(name), flow };
      setRecords((prev) => [rec, ...prev]);
      persistNewRecord(rec);
      setCurrentId(rec.id);
      setAiDraftId(rec.id);
    }
    setActiveTab("builder");

    // The model's own caveats matter more than a success chime — a step it had
    // to skip for lack of a template is exactly what the user must know.
    const notes = (result.notes ?? []).filter(Boolean);
    toast.success(result.summary || tr("Agent AI przygotował scenariusz"), {
      description: notes.length > 0 ? notes.join(" ") : tr("Dopracuj go w Wizualnym builderze."),
      duration: notes.length > 0 ? 12000 : 5000,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {tr("Automatyzacje")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tr("Twórz workflowy marketingowe i operacyjne.")}
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setNewAutomationOpen(true)}>
          <Plus className="h-4 w-4" /> {tr(" Nowa automatyzacja")}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="h-auto p-0 bg-transparent border-b border-border rounded-none w-full justify-start gap-1">
          {[
            { v: "list", l: "Lista", i: List },
            { v: "builder", l: "Wizualny builder", i: Workflow },
            { v: "ai", l: "Agent AI", i: Bot },
            { v: "engine", l: "PRM Engine", i: Gauge },
            { v: "stats", l: "Statystyki", i: BarChart3 },
          ].map((t) => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 gap-2"
            >
              <t.i className="h-4 w-4" /> {t.l}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* LIST */}
        <TabsContent value="list" className="mt-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">{tr("Lista automatyzacji")}</CardTitle>
              <div className="relative w-72 max-w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tr("Szukaj automatyzacji...")}
                  className="pl-8 h-9"
                />
              </div>
            </CardHeader>
            <CardContent className="divide-y">
              {!recordsLoaded ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : visibleRecords.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {query.trim()
                    ? tr("Brak automatyzacji pasujących do „{v0}”.", { v0: query.trim() })
                    : tr("Nie masz jeszcze żadnej automatyzacji.")}
                </div>
              ) : (
                visibleRecords.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center gap-4 py-3 first:pt-0 last:pb-0 group cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors"
                    onClick={() => openAutomation(a.id)}
                  >
                    <div className="h-10 w-10 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <div className="font-medium text-sm group-hover:text-primary transition-colors">
                        {a.name || tr("Bez nazwy")}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {tr("Trigger: ")} {triggerLabel(a.flow)}
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold">
                        {(runCounts[a.id] ?? 0).toLocaleString(intlLocale())}
                      </span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {runCounts[a.id] === 1 ? "kontakt" : tr("kontaktów")}
                      </span>
                    </div>
                    <StatusBadge status={a.status} />
                    <Switch
                      checked={a.status === "active"}
                      onCheckedChange={(v) => attemptSetActive(a.id, v)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem className="gap-2" onClick={() => openAutomation(a.id)}>
                          <Workflow className="h-3.5 w-3.5" /> {tr(" Otwórz w builderze")}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2" onClick={() => setRenameTarget(a)}>
                          <Pencil className="h-3.5 w-3.5" /> {tr(" Zmień nazwę")}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2" onClick={() => handleDuplicate(a)}>
                          <Copy className="h-3.5 w-3.5" /> {tr(" Duplikuj")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2 text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(a)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {tr(" Usuń")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* BUILDER */}
        <TabsContent value="builder" className="mt-6">
          {currentRecord ? (
            <Card className="border-border/60 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card flex-wrap">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setActiveTab("list")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="h-8 w-8 rounded-lg bg-primary-soft flex items-center justify-center text-primary">
                  <Workflow className="h-4 w-4" />
                </div>
                <div className="text-sm font-semibold">{currentRecord.name || tr("Bez nazwy")}</div>
                <StatusBadge status={currentRecord.status} />
                <div className="ml-auto flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setDryRunOpen(true)}
                  >
                    <PlayCircle className="h-3.5 w-3.5" /> {tr(" Przetestuj")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setHistoryOpen(true)}
                  >
                    <History className="h-3.5 w-3.5" /> {tr(" Przebiegi")}
                    {(runCounts[currentRecord.id] ?? 0) > 0 && (
                      <span className="ml-0.5 rounded-full bg-primary-soft px-1.5 text-[10px] font-semibold text-primary">
                        {runCounts[currentRecord.id]}
                      </span>
                    )}
                  </Button>
                  {/* Editing is a mode you enter on purpose. An active
                      automation cannot be edited at all — see the banner below. */}
                  {editingFlow ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setEditingFlow(false)}
                    >
                      <Check className="h-3.5 w-3.5" /> {tr(" Zakończ edycję")}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={currentRecord.status === "active"}
                      title={
                        currentRecord.status === "active"
                          ? tr("Wstrzymaj automatyzację, aby ją edytować")
                          : undefined
                      }
                      onClick={() => setEditingFlow(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> {tr(" Edytuj")}
                    </Button>
                  )}
                  {editingFlow && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        updateRecord(currentRecord.id, { status: "draft" });
                        toast.success(tr("Zapisano jako wersję roboczą"));
                      }}
                    >
                      <Save className="h-3.5 w-3.5" /> {tr(" Zapisz jako wersję roboczą")}
                    </Button>
                  )}
                  <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
                    <span className="text-xs font-medium">
                      {currentRecord.status === "active" ? tr("Aktywna") : tr("Nieaktywna")}
                    </span>
                    <Switch
                      checked={currentRecord.status === "active"}
                      onCheckedChange={(v) => attemptSetActive(currentRecord.id, v)}
                    />
                  </div>
                </div>
              </div>

              {currentRecord.status === "active" && (
                <div className="flex flex-wrap items-center gap-3 border-b border-border bg-warning/10 px-4 py-2.5 text-xs text-warning-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="flex-1 min-w-[240px]">
                    <b>{tr("Aktywnej automatyzacji nie można edytować.")}</b>{" "}
                    {tr(
                      " Pacjenci są w niej w tej chwili w trakcie — zmiana kroku wywala przebieg każdego, kto właśnie na nim stoi. Wstrzymaj ją, wprowadź zmiany i włącz ponownie.",
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={() => {
                      attemptSetActive(currentRecord.id, false);
                      setEditingFlow(true);
                    }}
                  >
                    <Pause className="h-3.5 w-3.5" /> {tr(" Wstrzymaj i edytuj")}
                  </Button>
                </div>
              )}

              <AutomationBuilder
                record={currentRecord}
                readOnly={!editingFlow || currentRecord.status === "active"}
                onChangeFlow={(flow) => updateRecord(currentRecord.id, { flow })}
              />

              <DryRunDialog
                open={dryRunOpen}
                onOpenChange={setDryRunOpen}
                automationId={currentRecord.id}
                automationName={currentRecord.name || "Bez nazwy"}
              />

              <RunHistorySheet
                automationId={currentRecord.id}
                automationName={currentRecord.name}
                flow={currentRecord.flow}
                open={historyOpen}
                onOpenChange={setHistoryOpen}
              />
            </Card>
          ) : (
            <Card className="border-border/60 shadow-sm">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  {tr("Wybierz automatyzację z listy albo stwórz nową.")}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setActiveTab("list")}>
                    {tr("Wróć do listy")}
                  </Button>
                  <Button className="gap-1.5" onClick={() => setNewAutomationOpen(true)}>
                    <Plus className="h-4 w-4" /> {tr(" Nowa automatyzacja")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* AI AGENT */}
        <TabsContent value="ai" className="mt-6">
          <AiAgent onGenerate={handleGenerate} records={records} onOpen={openAutomation} />
        </TabsContent>

        {/* PRM ENGINE */}
        <TabsContent value="engine" className="mt-6">
          <div className="space-y-4">
            <EnginePanel />
            <div ref={insightsRef}>
              <SupervisorPanel />
            </div>
          </div>
        </TabsContent>

        {/* STATS */}
        <TabsContent value="stats" className="mt-6">
          <Stats records={records} runCounts={runCounts} />
        </TabsContent>
      </Tabs>

      <NewAutomationDialog
        open={newAutomationOpen}
        onOpenChange={setNewAutomationOpen}
        onChoose={(mode) => (mode === "builder" ? handleChooseBuilder() : handleChooseAi())}
      />

      <CreateAutomationNameDialog
        open={namePromptOpen}
        onOpenChange={setNamePromptOpen}
        onSubmit={handleNameSubmit}
      />

      <CreateAutomationNameDialog
        open={!!renameTarget}
        onOpenChange={(o) => !o && setRenameTarget(null)}
        initialName={renameTarget?.name ?? ""}
        title={tr("Zmień nazwę automatyzacji")}
        description={tr(
          "Nazwa jest widoczna na liście, w historii przebiegów i w dzienniku silnika.",
        )}
        submitLabel="Zapisz"
        onSubmit={(name) => {
          if (renameTarget) updateRecord(renameTarget.id, { name });
          setRenameTarget(null);
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("Usunąć automatyzację „")}
              {deleteTarget?.name || tr("Bez nazwy")}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.status === "active"
                ? tr(
                    "Automatyzacja jest aktywna — trwające przebiegi zatrzymają się przy najbliższym kroku. ",
                  )
                : ""}

              {tr(
                "Historia przebiegów i wpisy w dzienniku zostają. Tej operacji nie można cofnąć.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Anuluj")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              {tr("Usuń")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------- AI Agent ---------- */

function AiAgent({
  onGenerate,
  records,
  onOpen,
}: {
  onGenerate: (prompt: string) => Promise<void>;
  records: AutomationRecord[];
  onOpen: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const examples = [
    tr("Powitanie nowych pacjentów + przypomnienie po 7 dniach"),
    tr("Win-back: nieaktywni 30+ dni, email + SMS jeśli nie otworzy"),
    tr("Po wizycie kardiologicznej — ankieta NPS i materiały edukacyjne"),
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{tr("Agent AI")}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tr(
                  "Opisz cel — model zaprojektuje scenariusz z realnych kroków i Twoich szablonów.",
                )}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={tr(
              "np. Stwórz automatyzację, która wita nowych pacjentów emailem, a po 3 dniach wysyła SMS jeśli nie otworzyli wiadomości...",
            )}
            className="min-h-[140px] resize-none"
          />
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              {tr("Przykładowe prompty")}
            </div>
            <div className="flex flex-wrap gap-2">
              {examples.map((e) => (
                <button
                  key={e}
                  onClick={() => setPrompt(e)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:bg-primary-soft hover:border-primary/40 transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            {busy && (
              <span className="mr-auto text-xs text-muted-foreground">
                {tr("Model projektuje scenariusz — to zwykle kilkanaście sekund.")}
              </span>
            )}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setPrompt("")}>
              {tr("Wyczyść")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!prompt.trim() || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onGenerate(prompt.trim());
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {busy ? tr("Generuję…") : tr("Generuj automatyzację")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{tr("Twoje scenariusze")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {tr("Kliknij, aby otworzyć w Wizualnym builderze.")}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {records.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {tr("Nie masz jeszcze żadnej automatyzacji.")}
            </p>
          )}
          {records.slice(0, 6).map((r) => {
            const steps = r.flow?.nodes.filter((n) => n.kind !== "trigger").length ?? 0;
            return (
              <button
                key={r.id}
                onClick={() => onOpen(r.id)}
                className="w-full text-left rounded-lg border border-border p-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm font-medium">{r.name || tr("Bez nazwy")}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
                  <span>
                    {steps} {steps === 1 ? "krok" : tr("kroków")}
                  </span>
                  <span>{triggerLabel(r.flow)}</span>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Statistics ---------- */

function Stats({
  records,
  runCounts,
}: {
  records: AutomationRecord[];
  runCounts: Record<string, number>;
}) {
  const activeCount = records.filter((r) => r.status === "active").length;
  const totalUsers = Object.values(runCounts).reduce((sum, n) => sum + n, 0);
  const [kpiData, setKpiData] = useState<AutomationKpis | null>(null);

  useEffect(() => {
    getAutomationKpis()
      .then(setKpiData)
      .catch(() => {
        /* the per-automation breakdown below still renders without the headline numbers */
      });
  }, []);

  // Nothing sent yet is a real answer ("0"), but a rate over zero sends is not —
  // show a dash rather than a fabricated 0%.
  const percent = (value: number | null) =>
    value === null
      ? "—"
      : value.toLocaleString(intlLocale(), {
          style: "percent",
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
  const number = (value: number | undefined) =>
    value === undefined ? "…" : value.toLocaleString(intlLocale());
  const windowLabel = `${kpiData?.windowDays ?? 30} dni`;

  const kpis = [
    {
      label: tr("Aktywne automatyzacje"),
      value: String(activeCount),
      icon: Zap,
      tone: "bg-primary-soft text-primary",
    },
    {
      label: tr("Kontakty w workflow"),
      value: totalUsers.toLocaleString(intlLocale()),
      icon: Users,
      tone: "bg-accent text-accent-foreground",
    },
    {
      label: tr("Wysłane wiadomości ({windowLabel})", { windowLabel: windowLabel }),
      value: kpiData ? number(kpiData.emailsSent + kpiData.smsSent) : "…",
      hint: kpiData
        ? `${number(kpiData.emailsSent)} e-mail · ${number(kpiData.smsSent)} SMS`
        : undefined,
      icon: Send,
      tone: "bg-success/15 text-success",
    },
    {
      label: tr("Open rate ({windowLabel})", { windowLabel: windowLabel }),
      value: kpiData ? percent(kpiData.openRate) : "…",
      hint: tr("tylko e-maile wysłane przez silnik"),
      icon: Eye,
      tone: "bg-warning/20 text-warning-foreground",
    },
    {
      label: tr("Click rate ({windowLabel})", { windowLabel: windowLabel }),
      value: kpiData ? percent(kpiData.clickRate) : "…",
      hint: tr("unikalne kliknięcia / wysyłki"),
      icon: MousePointerClick,
      tone: "bg-primary-soft text-primary",
    },
    {
      label: tr("Ukończone przebiegi ({windowLabel})", { windowLabel: windowLabel }),
      value: kpiData ? number(kpiData.runsCompleted) : "…",
      icon: TrendingUp,
      tone: "bg-success/15 text-success",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="border-border/60 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${k.tone}`}>
                <k.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="text-xl font-semibold tracking-tight">{k.value}</div>
                {k.hint && <div className="text-[11px] text-muted-foreground mt-0.5">{k.hint}</div>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {tr(
          "Wszystkie liczby pochodzą z realnych przebiegów PRM Engine — wysyłki liczone są z dziennika wykonanych kroków (nieudane i pominięte nie wchodzą), a open/click rate z pikseli i przekierowań w wiadomościach wysłanych przez silnik. Wysyłki testowe z zakładek Email i SMS nie są tu wliczane. Otwarcia bywają zawyżone przez Apple Mail Privacy Protection, które pobiera piksel bez udziału odbiorcy.",
        )}
      </p>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{tr("Przebiegi automatyzacji")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {records.map((a) => {
            const count = runCounts[a.id] ?? 0;
            return (
              <div key={a.id} className="py-3 first:pt-0 last:pb-0 flex items-center gap-4">
                <div className="h-9 w-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="text-sm font-medium">{a.name || tr("Bez nazwy")}</div>
                  <div className="text-xs text-muted-foreground">
                    {count.toLocaleString(intlLocale())}{" "}
                    {count === 1 ? "przebieg" : tr("przebiegów")}
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
