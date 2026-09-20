import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  ImagePlus,
  Loader2,
  Monitor,
  Moon,
  Send,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { uploadMedia } from "@/lib/api/media.functions";
import { runCreativeCoder } from "@/lib/api/creative.functions";
import type { CreativeKind, CreativeTurn } from "@/lib/ai/creative-coder.server";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Studio kreacji — chat z PRM_Agentem po lewej, podgląd kodu po prawej.
 *
 * Przepływ: użytkownik wrzuca grafikę od grafika → plik ląduje w bibliotece
 * Media (folder = kanał) → agent dostaje grafikę i publiczny adres → oddaje
 * zakodowaną wiadomość z tytułami, preheaderem i rekomendacjami → każda
 * kolejna wiadomość w chacie to poprawka na ostatniej wersji.
 *
 * Rozmowa żyje w stanie komponentu, nie w bazie: to narzędzie robocze, a jego
 * produktem jest zapisana treść — nie historia czatu.
 */

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
}

type PreviewMode = "desktop" | "mobile";

export function CreativeStudioDialog({
  open,
  onOpenChange,
  kind,
  onSave,
  initialImage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CreativeKind;
  /**
   * Grafika wstawiona z zewnątrz — dziś z Canvy. Trafiła już do Media, więc
   * okno **pomija krok wgrywania**: przeciąganie pliku, który system właśnie
   * sam pobrał, byłoby proszeniem o to samo drugi raz.
   */
  initialImage?: { mediaId: string; name: string } | null;
  /** Zapis gotowej treści jako pozycji w module (source = "html"). */
  onSave: (input: {
    name: string;
    blocks: { id: string; type: string; data: Record<string, string> }[];
  }) => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mediaId, setMediaId] = useState<string | null>(initialImage?.mediaId ?? null);
  const [mediaName, setMediaName] = useState("");
  const [html, setHtml] = useState("");
  /** Klocki wyniku — to one lądują w edytorze, HTML jest tylko podglądem. */
  const [blocks, setBlocks] = useState<
    { id: string; type: string; data: Record<string, string> }[]
  >([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [preheader, setPreheader] = useState("");
  const [recommendations, setRecommendations] = useState<string[]>([]);
  /**
   * Kadry wycięte z projektu. Trzymane między turami: przy poprawce lecą
   * z powrotem na serwer, żeby nie ciąć grafiki drugi raz — inaczej każda
   * poprawka mnożyłaby pliki w Media i zmieniała adresy pod obrazami, które
   * już siedzą w kodzie.
   */
  const [slices, setSlices] = useState<
    { name: string; mediaId: string; publicPath: string; pixelWidth: number; pixelHeight: number }[]
  >([]);
  const [mode, setMode] = useState<PreviewMode>("desktop");
  const [copiedSubject, setCopiedSubject] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const kindLabel = kind === "popup" ? "pop-up" : kind === "newsletter" ? "newsletter" : "e-mail";

  // Grafika podana z zewnątrz (Canva) po otwarciu okna albo po zmianie projektu.
  // Kadry i poprzedni kod czyścimy z tego samego powodu co przy wgraniu pliku:
  // inaczej agent mieszałby dwa różne projekty.
  useEffect(() => {
    if (!initialImage) return;
    setMediaId(initialImage.mediaId);
    setMediaName(initialImage.name);
    setSlices([]);
    setHtml("");
    setBlocks([]);
  }, [initialImage?.mediaId]);

  async function handleUpload(file: File) {
    const bytes = await file.arrayBuffer();
    let base64 = "";
    // Konwersja porcjami — String.fromCharCode(...cały_plik) wywala stos przy
    // grafice powyżej ~100 kB.
    const view = new Uint8Array(bytes);
    const chunk = 0x8000;
    for (let i = 0; i < view.length; i += chunk) {
      base64 += String.fromCharCode(...view.subarray(i, i + chunk));
    }
    const saved = await uploadMedia({
      data: {
        fileName: file.name,
        mimeType: file.type,
        folder: kind,
        bytesBase64: btoa(base64),
      },
    });
    setMediaId(saved.id);
    setMediaName(file.name);
    // Nowy projekt = nowe kadry. Zostawienie starych dałoby kod mieszający
    // zdjęcia z dwóch różnych kampanii.
    setSlices([]);
    setHtml("");
    setBlocks([]);
    toast.success(t("Grafika w bibliotece Media (folder {kindLabel}).", { kindLabel: kindLabel }));
  }

  async function send(instruction: string) {
    if (busy) return;
    const text =
      instruction.trim() ||
      (html ? "" : t("Zakoduj {kindLabel} z załączonej grafiki.", { kindLabel: kindLabel }));
    if (!text) return;
    if (!mediaId && !html) {
      toast.error(t("Najpierw wrzuć grafikę — agent koduje z pliku od grafika."));
      return;
    }

    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    try {
      const result = await runCreativeCoder({
        data: {
          kind,
          mediaId,
          instruction: text,
          // Historia bez HTML — kod niesie `priorHtml`, rozmowa sam tekst.
          history: messages.slice(-12) as CreativeTurn[],
          priorHtml: html,
          priorBlocks: blocks,
          existingSlices: slices,
        },
      });
      setMessages((prev) => [...prev, { role: "assistant", text: result.reply }]);
      if (result.blocks.length > 0) setBlocks(result.blocks);
      if (result.html) setHtml(result.html);
      if (result.slices.length > 0) setSlices(result.slices);
      if (result.subjects.length > 0) setSubjects(result.subjects);
      if (result.preheader) setPreheader(result.preheader);
      setRecommendations(result.recommendations);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: err instanceof Error ? err.message : t("Coś poszło nie tak — spróbuj ponownie."),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function copySubject(subject: string, i: number) {
    void navigator.clipboard.writeText(subject);
    setCopiedSubject(i);
    setTimeout(() => setCopiedSubject(null), 1500);
  }

  /**
   * Podgląd renderuje **fragment**, nie dokument — renderer kreatora oddaje
   * same klocki. Opakowujemy je tak, jak opakuje je wysyłka: białe tło,
   * szerokość 600 px, wyśrodkowane. Bez tego blok obrazu rozciągałby się na
   * całą szerokość okna i podgląd kłamałby o proporcjach.
   */
  const frameDoc =
    kind === "popup"
      ? `<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f9"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.25);padding:28px 24px">${html}</div></body></html>`
      : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f1f5f9"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9"><tr><td align="center" style="padding:16px 0"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff"><tr><td style="padding:0">${html}</td></tr></table></td></tr></table></body></html>`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1280px] h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> {t(" Studio kreacji — ")} {kindLabel}
          </DialogTitle>
          <DialogDescription>
            {t("Wrzuć grafikę od grafika. PRM_Agent potnie projekt na kadry i ułoży z niego")}
            {kind === "popup" ? " pop-up" : ` ${kindLabel}`}{" "}
            {t(
              " z klocków — gotowy do poprawiania przeciąganiem w edytorze. Poprawki możesz też zgłaszać w chacie.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-4">
          {/* ── chat ── */}
          <div className="flex w-[380px] shrink-0 flex-col rounded-lg border">
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t(
                    'Zacznij od wrzucenia grafiki (przycisk niżej). Potem możesz pisać np. „zamień kolejność sekcji", „dodaj przycisk z linkiem do rejestracji", „zaproponuj inne tytuły".',
                  )}
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {m.text}
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t(" PRM_Agent koduje…")}
                </div>
              )}
            </div>

            {recommendations.length > 0 && (
              <div className="border-t bg-amber-50/60 p-3 text-xs space-y-1 max-h-36 overflow-y-auto">
                <div className="font-medium text-amber-900">{t("Rekomendacje agenta")}</div>
                {recommendations.map((r, i) => (
                  <div key={i} className="text-amber-800">
                    • {r}
                  </div>
                ))}
              </div>
            )}

            <div className="border-t p-2 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void handleUpload(f).catch((err) => toast.error(String(err?.message ?? err)));
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />{" "}
                  {mediaId ? t("Zmień grafikę") : t("Wrzuć grafikę")}
                </Button>
                {mediaName && (
                  <Badge variant="secondary" className="max-w-[180px] truncate font-normal">
                    {mediaName}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder={html ? t("Opisz poprawkę…") : t("Dodatkowe wytyczne (opcjonalnie)…")}
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                />
                <Button size="icon" disabled={busy} onClick={() => void send(input)}>
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* ── podgląd ── */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={mode === "desktop" ? "secondary" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setMode("desktop")}
              >
                <Monitor className="h-4 w-4" /> {t(" Komputer")}
              </Button>
              <Button
                variant={mode === "mobile" ? "secondary" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setMode("mobile")}
              >
                <Smartphone className="h-4 w-4" /> {t(" Telefon")}
              </Button>
              <div className="flex-1" />
              <Button
                size="sm"
                disabled={blocks.length === 0}
                onClick={() => {
                  const name =
                    mediaName.replace(/\.[a-z0-9]+$/i, "") ||
                    `Kreacja ${new Date().toLocaleDateString(intlLocale())}`;
                  onSave({ name, blocks });
                  onOpenChange(false);
                }}
              >
                {t("Zapisz i otwórz w edytorze")}
              </Button>
            </div>

            {kind !== "popup" && (subjects.length > 0 || preheader) && (
              <div className="rounded-lg border bg-muted/30 p-2 text-xs space-y-1.5 max-h-32 overflow-y-auto">
                {subjects.map((s, i) => (
                  <button
                    key={i}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted"
                    onClick={() => copySubject(s, i)}
                    title={t("Kliknij, żeby skopiować")}
                  >
                    {copiedSubject === i ? (
                      <Check className="h-3 w-3 shrink-0 text-success" />
                    ) : (
                      <Copy className="h-3 w-3 shrink-0 opacity-50" />
                    )}
                    <span className="truncate">{s}</span>
                  </button>
                ))}
                {preheader && (
                  <div className="px-2 text-muted-foreground">
                    {t("Preheader: ")} <span className="italic">{preheader}</span>
                  </div>
                )}
              </div>
            )}

            <div
              className={cn(
                "min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/20",
                mode === "mobile" && "mx-auto w-[375px]",
              )}
            >
              {html ? (
                <iframe
                  title={t("Podgląd kreacji")}
                  /*
                   * `allow-same-origin` bez `allow-scripts`.
                   *
                   * Pusty `sandbox` daje ramce **nieprzezroczyste pochodzenie**
                   * i przeglądarka nie wysyła wtedy żądań o obrazy z naszego
                   * serwera — kadry pokazywały się jako teksty alternatywne,
                   * a w dzienniku sieci nie było ani jednego żądania. Kluczowe
                   * jest to, czego tu NIE MA: bez `allow-scripts` żaden skrypt
                   * z treści i tak się nie wykona, więc podgląd zostaje bezpieczny.
                   */
                  sandbox="allow-same-origin"
                  srcDoc={frameDoc}
                  className="h-full w-full border-0 bg-white"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
                  {t("Tu pojawi się podgląd — komputer i telefon .")}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
