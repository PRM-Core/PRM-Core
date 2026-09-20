import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, Users as UsersIcon, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askSegmentAssistant } from "@/lib/api/segments.functions";
import type { SegmentDefinition } from "@/lib/segments/segment-definition";
import { t, localized } from "@/lib/i18n";

/**
 * The conversational half of the segment builder.
 *
 * It exists because the most common request is one the data cannot answer —
 * "kontakty, które kliknęły w przycisk" — and the useful answer is a sentence
 * explaining what *is* recorded plus an offer of the nearest real equivalent.
 * A one-shot generator would either invent a condition or refuse; a
 * conversation can negotiate.
 *
 * The count under each proposal is computed server-side by the same evaluator a
 * saved segment runs through — the model is never asked how many people match,
 * because it has no way to know and every incentive to guess.
 */

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  proposal?: {
    definition: SegmentDefinition;
    summary: string;
    name?: string;
    members: number;
    total: number;
    warnings: string[];
  };
}

const EXAMPLES = localized(() => [
  t("Pacjenci, którzy byli na stronie rejestracji, ale nie umówili wizyty"),
  t("Osoby z tagiem RDS bez zgody na SMS"),
  t("Kto kliknął w ostatni newsletter w ciągu 30 dni"),
]);

export function SegmentAssistant({
  definition,
  onApply,
}: {
  definition: SegmentDefinition;
  onApply: (definition: SegmentDefinition, name?: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setError(null);
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", text: question }];
    setMessages(next);
    setBusy(true);

    const result = await askSegmentAssistant({
      data: {
        // Only the plain turns go back to the model — the proposal is our own
        // structure and would just cost tokens.
        messages: next.map((m) => ({ role: m.role, text: m.text })),
        definition,
      },
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? t("Asystent nie odpowiedział."));
      return;
    }
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: result.reply ?? "", proposal: result.proposal },
    ]);
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t(
                "Opisz, kogo chcesz objąć segmentem — zwykłym zdaniem. Asystent zna wszystkie dostępne warunki i ",
              )}{" "}
              <b>{t("powie wprost, jeśli czegoś nie da się sprawdzić")}</b>
              {t(", proponując najbliższy sensowny odpowiednik.")}
            </p>
            <div className="space-y-1.5">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => void send(e)}
                  className="w-full rounded-lg border border-border/60 px-2.5 py-2 text-left text-xs hover:bg-muted/50"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground max-w-[85%]"
                  : "bg-muted/50 w-full whitespace-pre-wrap"
              }`}
            >
              {m.text}
            </div>

            {m.proposal && (
              <div className="mt-2 rounded-lg border border-primary/30 bg-primary-soft/40 p-3">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />

                  {t("Propozycja")}
                  {m.proposal.name ? `: ${m.proposal.name}` : ""}
                </div>
                {m.proposal.summary && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {m.proposal.summary}
                  </p>
                )}

                {/* The number comes from the evaluator, not the model. */}
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs">
                  <UsersIcon className="h-3.5 w-3.5 text-primary" />
                  <b>{m.proposal.members}</b>
                  <span className="text-muted-foreground">
                    {t("z ")} {m.proposal.total} {t(" kontaktów")}
                  </span>
                </div>
                {m.proposal.members === 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("Nikt nie pasuje — sprawdź, czy adresy i nazwy są takie jak w bazie.")}
                  </p>
                )}

                {m.proposal.warnings.length > 0 && (
                  <div className="mt-2 flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[oklch(0.48_0.15_75)]" />
                    <div className="text-[11px] leading-snug text-[oklch(0.38_0.1_75)] dark:text-[oklch(0.85_0.1_75)]">
                      {m.proposal.warnings.map((w) => (
                        <p key={w}>{w}</p>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  size="sm"
                  className="mt-2.5 h-7 gap-1.5 text-xs"
                  onClick={() => onApply(m.proposal!.definition, m.proposal!.name)}
                >
                  <Check className="h-3.5 w-3.5" />

                  {t("Wstaw do buildera")}
                </Button>
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t(" myślę…")}
          </div>
        )}
        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder={t("Kogo chcesz objąć segmentem?")}
            className="min-h-[60px] resize-none text-sm"
            disabled={busy}
          />
          <Button
            size="icon"
            className="self-end"
            disabled={busy || !input.trim()}
            onClick={() => void send(input)}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {t("Każda odpowiedź to wywołanie modelu — liczy się do dziennego limitu kosztów.")}
        </p>
      </div>
    </div>
  );
}
