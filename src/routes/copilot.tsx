import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Send,
  Loader2,
  Plus,
  History,
  Trash2,
  BookPlus,
  Users,
  Workflow,
  Gauge,
  UserSearch,
  ShieldOff,
  Settings2,
} from "lucide-react";
import {
  sendCopilotMessage,
  getCopilotStatus,
  getCopilotHistory,
  openCopilotConversation,
  removeCopilotConversation,
} from "@/lib/api/copilot.functions";
import { saveKnowledge } from "@/lib/api/knowledge.functions";
import { intlLocale, t as tr, localized } from "@/lib/i18n";

export const Route = createFileRoute("/copilot")({
  head: () => ({ meta: [{ title: tr("AI Copilot — PRM Core") }] }),
  component: CopilotPage,
});

/** Starter prompts — each one is answerable from the read-only tools. */
const SUGGESTIONS = localized(() => [
  {
    icon: Users,
    title: tr("Ilu mamy pacjentów?"),
    prompt: tr("Ilu mamy kontaktów i jak dzielą się na statusy oraz segmenty?"),
  },
  {
    icon: Workflow,
    title: tr("Co robią automatyzacje?"),
    prompt: tr(
      "Wypisz automatyzacje: które są aktywne, na co reagują i ilu kontaktów przez nie przeszło. Wskaż te, które wyglądają na zepsute.",
    ),
  },
  {
    icon: Gauge,
    title: tr("Jak działa silnik?"),
    prompt: tr(
      "Podsumuj stan PRM Engine i wyniki wysyłek z ostatnich 30 dni. Czy coś wymaga uwagi?",
    ),
  },
  {
    icon: UserSearch,
    title: tr("Streść pacjenta"),
    prompt: tr("Znajdź kontakt Anna Kowalska i streść, co się z nią dotąd działo."),
  },
]);

type Turn = { role: "user" | "assistant"; text: string; used?: string[] };

interface Conversation {
  id: string;
  title: string;
  messages: number;
  lastAt: number;
}

function newConversationId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Status {
  provider: string;
  model: string;
  keyConfigured: boolean;
  spentToday: number;
  dailyLimit: number;
  knowledgeEntries: number;
}

function CopilotPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [conversationId, setConversationId] = useState(newConversationId);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [retentionDays, setRetentionDays] = useState(7);
  /** Assistant message being turned into a knowledge entry, by index. */
  const [teaching, setTeaching] = useState<number | null>(null);
  const [lesson, setLesson] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const refreshHistory = () => {
    getCopilotHistory().then((h) => {
      setHistory(h.conversations);
      setRetentionDays(h.retentionDays);
    });
  };

  const refreshStatus = () => {
    getCopilotStatus().then(setStatus);
  };

  useEffect(refreshStatus, []);
  useEffect(refreshHistory, []);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, busy]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const next: Turn[] = [...turns, { role: "user", text: question }];
    setTurns(next);
    setInput("");
    setBusy(true);

    const result = await sendCopilotMessage({
      data: {
        conversationId,
        history: next.map(({ role, text: t }) => ({ role, text: t })),
      },
    });
    setBusy(false);

    if (!result.ok || !result.text) {
      toast.error(result.error ?? tr("Copilot nie odpowiedział."));
      // The question stays on screen so it can be retried without retyping.
      return;
    }
    setTurns([...next, { role: "assistant", text: result.text, used: result.used }]);
    refreshStatus();
    refreshHistory();
  };

  const startNew = () => {
    setConversationId(newConversationId());
    setTurns([]);
    setTeaching(null);
  };

  const openConversation = async (id: string) => {
    const rows = await openCopilotConversation({ data: { conversationId: id } });
    setConversationId(id);
    setTurns(rows.map((r) => ({ role: r.role, text: r.text, used: r.tools })));
    setTeaching(null);
  };

  const dropConversation = async (id: string) => {
    await removeCopilotConversation({ data: { conversationId: id } });
    if (id === conversationId) startNew();
    refreshHistory();
    toast.success(tr("Rozmowa usunięta."));
  };

  /**
   * The only way a correction survives into the next conversation: the model
   * does not learn, so a fix has to become a knowledge entry it will be given.
   */
  const teach = async (index: number) => {
    const body = lesson.trim();
    if (!body) return;
    const question = [...turns.slice(0, index)].reverse().find((t) => t.role === "user");
    await saveKnowledge({
      data: {
        title: tr("Sprostowanie: {v0}", {
          v0: (question?.text ?? "rozmowa z Copilotem").slice(0, 60),
        }),
        content: body,
      },
    });
    setTeaching(null);
    setLesson("");
    refreshStatus();
    toast.success(tr("Zapisano w bazie wiedzy — Copilot dostanie to w kolejnych rozmowach."));
  };

  const overBudget = !!status && status.spentToday >= status.dailyLimit;
  const blocked = !status?.keyConfigured || overBudget;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          className="h-11 w-11 rounded-xl flex items-center justify-center text-primary-foreground shadow-sm"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{tr("AI Copilot")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tr("PRM_Agent z dostępem do Twoich danych — pyta bazę, zanim odpowie.")}
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={startNew}>
          <Plus className="h-4 w-4" /> {tr(" Nowa rozmowa")}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <Card className="border-border/60 shadow-[var(--shadow-card)] flex flex-col min-h-[520px]">
          <CardContent className="flex-1 p-6 space-y-4 overflow-y-auto">
            {turns.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-10">
                <Sparkles className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium">{tr("Zapytaj o swoje dane")}</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  {tr(
                    "Copilot liczy odpowiedzi z bazy — kontakty, automatyzacje, wysyłki, historia pacjenta. Zacznij od podpowiedzi po prawej.",
                  )}
                </p>
              </div>
            )}
            {turns.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {m.text}
                  {/* What the answer stands on — an answer with no tool behind it
                      is the model talking, and that difference matters here. */}
                  {m.role === "assistant" && (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {(m.used ?? []).map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px] font-normal">
                          {t}
                        </Badge>
                      ))}
                      {/* The model does not learn from being corrected here —
                          the only durable fix is a knowledge entry. */}
                      <button
                        onClick={() => {
                          setTeaching(teaching === i ? null : i);
                          setLesson("");
                        }}
                        className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                        title={tr("Zapisz sprostowanie do bazy wiedzy")}
                      >
                        <BookPlus className="h-3 w-3" /> {tr(" Popraw")}
                      </button>
                    </div>
                  )}
                  {teaching === i && (
                    <div className="mt-2 space-y-2 rounded-lg border border-border bg-card p-2">
                      <p className="text-[11px] text-muted-foreground">
                        {tr(
                          "Copilot nie zapamiętuje poprawek z rozmowy. Wpisz, jak jest naprawdę — trafi to do bazy wiedzy i będzie dołączane do każdej kolejnej rozmowy.",
                        )}
                      </p>
                      <Textarea
                        value={lesson}
                        onChange={(e) => setLesson(e.target.value)}
                        placeholder={tr(
                          "np. Gabinet laryngologiczny przyjmuje wtorki i czwartki 8:00–14:00.",
                        )}
                        className="min-h-[60px] resize-none text-foreground"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={!lesson.trim()} onClick={() => void teach(i)}>
                          {tr("Zapisz do bazy wiedzy")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setTeaching(null)}>
                          {tr("Anuluj")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> {tr(" Sprawdzam w bazie…")}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </CardContent>
          <div className="p-3 border-t border-border/60">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                placeholder={tr(
                  "Zapytaj o kontakty, automatyzacje, wysyłki albo konkretnego pacjenta…",
                )}
                className="min-h-[60px] resize-none"
                disabled={blocked}
              />
              <Button
                className="self-end gap-1.5"
                disabled={busy || blocked || !input.trim()}
                onClick={() => void ask(input)}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}

                {tr("Wyślij")}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {tr("Copilot ma dostęp ")} <b>{tr("tylko do odczytu")}</b>{" "}
              {tr(
                " — nie zmieni danych, nie wyśle wiadomości i nie włączy automatyzacji. Odpowiedzi są wspomagające; decyzję kliniczną zawsze podejmuje lekarz.",
              )}
            </p>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/60 shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-sm">{tr("Szybkie pytania")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  disabled={busy || blocked}
                  onClick={() => void ask(s.prompt)}
                  className="w-full text-left p-2.5 rounded-lg border border-border/60 hover:border-primary/40 hover:shadow-[var(--shadow-card)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 shrink-0 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
                      <s.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{s.title}</div>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-sm inline-flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> {tr(" Historia")}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {tr("Rozmowy z ostatnich ")} {retentionDays} {tr(" dni — potem kasują się same.")}
              </p>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">{tr("Brak zapisanych rozmów.")}</p>
              ) : (
                history.map((c) => (
                  <div
                    key={c.id}
                    className={`group flex items-center gap-1 rounded-lg border p-2 transition-colors ${
                      c.id === conversationId
                        ? "border-primary/40 bg-primary-soft/40"
                        : "border-border/60 hover:bg-muted/60"
                    }`}
                  >
                    <button
                      onClick={() => void openConversation(c.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-xs font-medium">{c.title}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(c.lastAt).toLocaleString(intlLocale(), {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {c.messages} {tr(" wiad.")}
                      </div>
                    </button>
                    <button
                      onClick={() => void dropConversation(c.id)}
                      className="shrink-0 text-muted-foreground/50 hover:text-destructive"
                      title={tr("Usuń rozmowę")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-sm">{tr("Model")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {!status ? (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{tr("Dostawca")}</span>
                    <span className="font-medium">{status.provider}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{tr("Model")}</span>
                    <span className="font-mono text-[11px] truncate">{status.model}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{tr("Klucz API")}</span>
                    {status.keyConfigured ? (
                      <Badge
                        variant="secondary"
                        className="font-normal bg-success/15 text-success text-[10px]"
                      >
                        {tr("skonfigurowany")}
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="font-normal bg-destructive/15 text-destructive text-[10px]"
                      >
                        {tr("brak")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{tr("Dziś wydano")}</span>
                    <span className={`font-medium ${overBudget ? "text-destructive" : ""}`}>
                      ${status.spentToday.toFixed(4)} / ${status.dailyLimit.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{tr("Baza wiedzy")}</span>
                    <span className="font-medium">
                      {status.knowledgeEntries} {tr(" wpisów")}
                    </span>
                  </div>

                  {!status.keyConfigured && (
                    <p className="pt-1 text-[11px] text-destructive leading-snug">
                      {tr(
                        "Brak klucza API — uzupełnij go w Integracje → Klucze i dane dostępowe, żeby Copilot zaczął odpowiadać.",
                      )}
                    </p>
                  )}
                  {overBudget && (
                    <p className="pt-1 text-[11px] text-destructive leading-snug">
                      {tr(
                        "Dzienny limit kosztów wyczerpany. Podnieś go w Ustawieniach → PRM_Agent.",
                      )}
                    </p>
                  )}

                  <Button variant="outline" size="sm" className="w-full mt-2 gap-1.5" asChild>
                    <Link to="/settings">
                      <Settings2 className="h-3.5 w-3.5" /> {tr(" Ustawienia PRM_Agent")}
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-[var(--shadow-card)]">
            <CardContent className="p-4 flex gap-2 text-[11px] text-muted-foreground">
              <ShieldOff className="h-4 w-4 shrink-0 text-muted-foreground/70" />
              <span>
                {tr("Ten sam PRM_Agent co w automatyzacjach, ale ")} <b>{tr("bez prawa zapisu")}</b>
                {tr(
                  ". Pisanie do pacjentów zostaje przy węźle Agent AI, gdzie uprawnienia nadaje się świadomie.",
                )}
              </span>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
