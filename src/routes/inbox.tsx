import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  MessageSquare,
  Send,
  Sparkles,
  ClipboardList,
  ListChecks,
  Loader2,
  Inbox as InboxIcon,
  ExternalLink,
  CheckCheck,
  ShieldOff,
  RotateCcw,
} from "lucide-react";
import {
  listInboxThreads,
  getInboxThread,
  markInboxThreadRead,
  sendInboxReply,
  suggestInboxReply,
  assignInboxThread,
  setInboxThreadStatus,
  listInboxAssignees,
  type InboxThreadSummary,
  type InboxThreadDetail,
} from "@/lib/api/inbox.functions";
import type { InboxChannel } from "@/lib/db/schema";
import { t as tr, localized } from "@/lib/i18n";

export const Route = createFileRoute("/inbox")({
  head: () => ({ meta: [{ title: tr("Omnichannel Inbox — PRM Core") }] }),
  /** `?thread=` lets a contact card open one conversation directly. */
  validateSearch: (search: Record<string, unknown>): { thread?: string } => ({
    thread: typeof search.thread === "string" && search.thread ? search.thread : undefined,
  }),
  component: InboxPage,
});

const channelMeta: Record<InboxChannel, { label: string; icon: typeof Mail; tone: string }> =
  localized(() => ({
    email: { label: tr("E-mail"), icon: Mail, tone: "bg-primary/15 text-primary" },
    sms: { label: "SMS", icon: MessageSquare, tone: "bg-success/15 text-success" },
    form: { label: tr("Formularz"), icon: ClipboardList, tone: "bg-muted text-foreground" },
    survey: {
      label: tr("Ankieta"),
      icon: ListChecks,
      tone: "bg-[oklch(0.78_0.15_75)]/20 text-[oklch(0.48_0.15_75)]",
    },
  }));

/** Channels a reply can actually go out on — a form has no return address of its own. */
function replyChannelFor(channel: InboxChannel): "email" | "sms" {
  return channel === "sms" ? "sms" : "email";
}

const REFRESH_MS = 8000;

function InboxPage() {
  const [threads, setThreads] = useState<InboxThreadSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InboxThreadDetail | null>(null);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [reply, setReply] = useState("");
  const [replyChannel, setReplyChannel] = useState<"email" | "sms">("email");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const refreshThreads = useCallback(async () => {
    const rows = await listInboxThreads({
      data: { search, channel: channelFilter, onlyUnread, includeClosed },
    });
    setThreads(rows);
    return rows;
  }, [search, channelFilter, onlyUnread, includeClosed]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    void listInboxAssignees().then(setAssignees);
  }, []);

  // Polling, not a socket: the inbox is a page somebody leaves open, and eight
  // seconds is the difference between "a reply appeared" and "I refreshed".
  useEffect(() => {
    const timer = setInterval(() => void refreshThreads(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshThreads]);

  const openThread = useCallback(async (threadId: string) => {
    setActiveId(threadId);
    const loaded = await getInboxThread({ data: { threadId } });
    setDetail(loaded);
    if (loaded) {
      setReplyChannel(replyChannelFor(loaded.thread.channel));
      if (loaded.thread.unreadCount > 0) {
        await markInboxThreadRead({ data: { threadId } });
      }
    }
  }, []);

  // Arriving from a contact card with ?thread=… — open that conversation once.
  const requestedThread = Route.useSearch().thread;
  useEffect(() => {
    if (requestedThread) void openThread(requestedThread);
  }, [requestedThread, openThread]);

  // Keep the open conversation in step with the list poll, so a reply that
  // arrives while it is on screen shows up without a click.
  useEffect(() => {
    if (!activeId) return;
    const timer = setInterval(async () => {
      const loaded = await getInboxThread({ data: { threadId: activeId } });
      setDetail(loaded);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length, activeId]);

  const handleSend = async () => {
    if (!detail || !reply.trim()) return;
    setSending(true);
    const result = await sendInboxReply({
      data: {
        threadId: detail.thread.id,
        channel: replyChannel,
        subject: detail.thread.subject,
        text: reply.trim(),
      },
    });
    setSending(false);
    if (!result.ok) {
      toast.error(result.error ?? tr("Nie udało się wysłać wiadomości."));
      return;
    }
    toast.success(replyChannel === "sms" ? tr("SMS wysłany.") : tr("E-mail wysłany."));
    setReply("");
    await openThread(detail.thread.id);
    await refreshThreads();
  };

  const handleSuggest = async () => {
    if (!detail) return;
    setSuggesting(true);
    const result = await suggestInboxReply({ data: { threadId: detail.thread.id } });
    setSuggesting(false);
    if (!result.ok || !result.text) {
      toast.error(result.error ?? tr("Nie udało się przygotować sugestii."));
      return;
    }
    setReply(result.text);
    toast.success(tr("Sugestia gotowa — przeczytaj i popraw przed wysłaniem."));
  };

  const handleAssign = async (userId: string) => {
    if (!detail) return;
    await assignInboxThread({
      data: { threadId: detail.thread.id, userId: userId === "none" ? null : userId },
    });
    await openThread(detail.thread.id);
    await refreshThreads();
  };

  const handleToggleStatus = async () => {
    if (!detail) return;
    const next = detail.thread.status === "open" ? "closed" : "open";
    await setInboxThreadStatus({ data: { threadId: detail.thread.id, status: next } });
    toast.success(next === "closed" ? tr("Rozmowa zamknięta.") : tr("Rozmowa otwarta ponownie."));
    await openThread(detail.thread.id);
    await refreshThreads();
  };

  const canReplyEmail = !!detail?.contact?.email;
  const canReplySms = !!detail?.contact?.phone;
  const dnc = !!detail?.contact?.dnc;
  const replyBlocked =
    dnc || (replyChannel === "email" && !canReplyEmail) || (replyChannel === "sms" && !canReplySms);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {tr("Skrzynka omnichannel")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tr("Wszystkie rozmowy z pacjentami — e-mail, SMS, formularze i ankiety.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={onlyUnread ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyUnread((v) => !v)}
          >
            {tr("Nieprzeczytane")}
          </Button>
          <Button
            variant={includeClosed ? "default" : "outline"}
            size="sm"
            onClick={() => setIncludeClosed((v) => !v)}
          >
            {tr("Z zamkniętymi")}
          </Button>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("Wszystkie kanały")}</SelectItem>
              {(Object.keys(channelMeta) as InboxChannel[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {channelMeta[c].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-230px)]">
        <Card className="border-border/60 shadow-[var(--shadow-card)] overflow-hidden flex flex-col py-0 gap-0">
          <div className="p-3 border-b border-border/60">
            <Input
              placeholder={tr("Szukaj po pacjencie lub treści…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads === null ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : threads.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                <InboxIcon className="h-8 w-8 mx-auto mb-3 opacity-40" />

                {tr(
                  "Brak rozmów. Wiadomości pojawią się tu, gdy pacjent wypełni formularz lub odpisze na e-mail albo SMS.",
                )}
              </div>
            ) : (
              threads.map((t) => {
                const Icon = channelMeta[t.channel].icon;
                const unread = t.unreadCount > 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => void openThread(t.id)}
                    className={`w-full text-left px-3 py-2.5 border-b border-border/40 hover:bg-muted/50 transition-colors ${activeId === t.id ? "bg-muted/60" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm truncate ${unread ? "font-semibold" : "font-medium text-muted-foreground"}`}
                      >
                        {t.contactName}
                      </span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {t.lastMessageAt.slice(5)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 font-normal ${channelMeta[t.channel].tone}`}
                      >
                        <Icon className="h-3 w-3 mr-1" />
                        {channelMeta[t.channel].label}
                      </Badge>
                      {unread && (
                        <span className="rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 leading-4">
                          {t.unreadCount}
                        </span>
                      )}
                      {t.status === "closed" && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                          {tr("zamknięta")}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground truncate">
                      {t.lastDirection === "out" && (
                        <span className="opacity-60">{tr("Ty: ")} </span>
                      )}
                      {t.lastPreview}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <Card className="border-border/60 shadow-[var(--shadow-card)] overflow-hidden flex flex-col py-0 gap-0">
          {!detail ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              {tr("Wybierz rozmowę z listy.")}
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-border/60 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    {detail.thread.contactName}
                    {detail.contact && (
                      <Link
                        to="/contacts/$id"
                        params={{ id: detail.contact.id }}
                        className="text-muted-foreground hover:text-primary"
                        title={tr("Otwórz kartę pacjenta")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    {dnc && (
                      <Badge
                        variant="secondary"
                        className="font-normal bg-destructive/15 text-destructive"
                      >
                        <ShieldOff className="h-3 w-3 mr-1" />

                        {tr("nie kontaktować")}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {channelMeta[detail.thread.channel].label}
                    {detail.contact?.email ? ` · ${detail.contact.email}` : ""}
                    {detail.contact?.phone ? ` · ${detail.contact.phone}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={detail.thread.assignedUserId ?? "none"}
                    onValueChange={(v) => void handleAssign(v)}
                  >
                    <SelectTrigger className="w-[170px] h-9">
                      <SelectValue placeholder={tr("Nieprzypisane")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tr("Nieprzypisane")}</SelectItem>
                      {assignees.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => void handleToggleStatus()}>
                    {detail.thread.status === "open" ? (
                      <>
                        <CheckCheck className="h-4 w-4 mr-1.5" />

                        {tr("Zamknij")}
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4 mr-1.5" />

                        {tr("Otwórz")}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/30">
                {detail.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${m.direction === "out" ? "bg-primary text-primary-foreground" : "bg-card border border-border/60"}`}
                    >
                      {m.body}
                      <div
                        className={`mt-1 text-[10px] ${m.direction === "out" ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                      >
                        {m.createdAt}
                        {m.sentByName ? ` · ${m.sentByName}` : ""}
                        {m.source === "agent" ? tr(" · PRM_Agent") : ""}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <CardContent className="p-3 border-t border-border/60 space-y-2">
                <div className="flex items-center gap-2">
                  <Select
                    value={replyChannel}
                    onValueChange={(v) => setReplyChannel(v as "email" | "sms")}
                  >
                    <SelectTrigger className="w-[130px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email" disabled={!canReplyEmail}>
                        {tr("E-mail")}
                      </SelectItem>
                      <SelectItem value="sms" disabled={!canReplySms}>
                        {tr("SMS")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={suggesting}
                    onClick={() => void handleSuggest()}
                  >
                    {suggesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}

                    {tr("Sugestia AI")}
                  </Button>
                  {dnc && (
                    <span className="text-xs text-destructive">
                      {tr("Pacjent wycofał zgodę — wysyłka zablokowana.")}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={
                      replyChannel === "sms"
                        ? tr("Treść SMS-a…")
                        : tr("Napisz odpowiedź — pójdzie e-mailem z pełnym trackingiem…")
                    }
                    className="min-h-[70px] resize-none"
                  />
                  <Button
                    className="self-end gap-1.5"
                    disabled={sending || replyBlocked || !reply.trim()}
                    onClick={() => void handleSend()}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}

                    {tr("Wyślij")}
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
