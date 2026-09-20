import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Blocks,
  Copy,
  GripVertical,
  Layers,
  Loader2,
  Monitor,
  Palette,
  Save,
  Settings2,
  Send,
  Smartphone,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BlockPreview } from "@/components/content-builder/BlockPreview";
import {
  BlockInspector,
  inlineEditable,
  inlinePatch,
  inlineValue,
  resizeColumns,
} from "@/components/content-builder/BlockEditor";
import { RichTextEditor } from "@/components/content-builder/RichTextEditor";
import { TestSendDialog } from "@/components/content-builder/TestSendDialog";
import { PopupSettingsDialog } from "@/components/content-builder/PopupSettingsDialog";
import { StudioStylesPanel } from "@/components/studio/StudioStylesPanel";
import { StudioSectionsPanel } from "@/components/studio/StudioSectionsPanel";
import { StudioQaPanel } from "@/components/studio/StudioQaPanel";
import {
  getContentItems,
  moveContentItem,
  saveContentItems,
} from "@/lib/api/content-items.functions";
import { StudioIntegrationsPanel } from "@/components/studio/StudioIntegrationsPanel";
import { CreativeStudioDialog } from "@/components/content-builder/CreativeStudioDialog";
import { StudioHtmlEditor } from "@/components/studio/StudioHtmlEditor";
import { StudioHome } from "@/components/studio/StudioHome";
import {
  BLOCK_PALETTES,
  STUDIO_FONTS,
  studioFontsHref,
  KIND_LABELS,
  makeBlock,
  popupConfigOf,
  type BlockType,
  type BuilderKind,
  type ContentBlock,
  type ContentItem,
  type PopupConfig,
} from "@/lib/content-builder";
import { cn } from "@/lib/utils";
import { count } from "@/lib/plural";
import { applyDrop, moveDragPayload, paletteDragPayload } from "@/lib/content-builder-dnd";
import { t as tr, localized } from "@/lib/i18n";

export const Route = createFileRoute("/studio")({
  head: () => ({ meta: [{ title: tr("Design Studio — PRM Core") }] }),
  validateSearch: (search: Record<string, unknown>): { kind?: string; id?: string } => ({
    kind: typeof search.kind === "string" ? search.kind : undefined,
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: StudioPage,
});

/**
 * Design Studio — edytor treści w układzie trzech kolumn.
 *
 * **Układ pochodzi z projektu placówki** (makieta z Lovable): lewy panel
 * z zakładkami Bloki/Sekcje/Style, płótno pośrodku, prawy panel
 * Właściwości/AI/Testy. Makieta była w całości pozorowana — każda akcja
 * kończyła się komunikatem, nic nie zapisywało się do bazy. Tutaj ten sam
 * układ jest podpięty do silnika, który już działa: bloki to prawdziwe
 * `ContentBlock`, zapis idzie do `content_items`, a podgląd rysuje ten sam
 * komponent, którego używa dotychczasowy edytor.
 *
 * **Czego świadomie nie ma**: zakładki Canva, podglądu w klientach poczty
 * i oceny spamu. Każde z nich wymaga usługi, której nie mamy (Canva Connect
 * API, Litmus, SpamAssassin), a pokazanie „Gmail OK" bez otwarcia wiadomości
 * w Gmailu byłoby stwierdzeniem nieprawdy o czymś, na czym placówka opiera
 * decyzję o wysyłce. Zakładka Testy pokazuje wyłącznie to, co potrafimy
 * policzyć na miejscu.
 */

/** Moduł, do którego wraca strzałka „wstecz". */
function backTo(kind: BuilderKind): string {
  return kind === "newsletter" ? "/newsletter" : kind === "popup" ? "/popup" : "/email";
}

/** Podpisy grup w palecie — kolejność jak w projekcie. */
const PALETTE_GROUPS: { label: string; types: BlockType[] }[] = localized(() => [
  {
    label: tr("Podstawowe"),
    types: ["header", "heading", "text", "image", "button", "divider", "spacer"],
  },
  { label: tr("Układy"), types: ["columns", "footer"] },
  { label: tr("Treść i dane"), types: ["html", "attachments", "plan", "social", "form", "survey"] },
]);

function StudioPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const kind = (search.kind ?? "email") as BuilderKind;

  const [items, setItems] = useState<ContentItem[] | null>(null);
  /**
   * Otwarta wiadomość bierze się **z adresu**, nie ze stanu komponentu.
   *
   * Wcześniej stan sam wybierał pierwszą wiadomość z listy, więc wejście
   * z paska bocznego (`/studio` bez `?id=`) nigdy nie pokazywało ekranu
   * głównego — efekt podstawiał identyfikator, zanim warunek zdążył zadziałać.
   * Adres jako jedyne źródło prawdy usuwa cały ten wyścig, a przy okazji daje
   * działający przycisk „wstecz" w przeglądarce.
   */
  const itemId = search.id ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [zoom, setZoom] = useState(100);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  /** Treść błędu wczytywania. Osobno od pustej listy — patrz `useEffect` niżej. */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Moduł, w którym wiadomość ma wylądować po zapisie. */
  const [target, setTarget] = useState<BuilderKind>(kind);
  /** Grafika pobrana z Canvy, przekazywana agentowi. */
  const [canvaImage, setCanvaImage] = useState<{ mediaId: string; name: string } | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  /** Szczelina, nad którą wisi przeciągany blok — `null`, gdy nic nie leci. */
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    getContentItems({ data: { kind: kind as never } })
      .then((rows) => {
        setItems(rows);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        // **Nieudane wczytanie to nie to samo co brak wiadomości.** Wcześniej
        // jedno i drugie kończyło się tym samym ekranem „Nie ma czego
        // otworzyć", więc awaria serwera wyglądała jak pusta lista — a to
        // komunikat, który wysyła człowieka zakładać wiadomość, która już
        // istnieje.
        setItems([]);
        setLoadError(err instanceof Error ? err.message : String(err));
      });
  }, [kind]);

  const item = useMemo(() => items?.find((i) => i.id === itemId) ?? null, [items, itemId]);
  // Stabilna referencja: `?? []` tworzyłoby nową tablicę przy każdym renderze,
  // przez co `selected` przeliczałby się bez końca.
  const blocks = useMemo(() => item?.blocks ?? [], [item]);

  /** Znajduje blok także wewnątrz kolumn — zagnieżdżenie jest płytkie. */
  const selected = useMemo(() => {
    if (!selectedId) return null;
    for (const b of blocks) {
      if (b.id === selectedId) return b;
      for (const col of b.columns ?? []) {
        const hit = col.find((c) => c.id === selectedId);
        if (hit) return hit;
      }
    }
    return null;
  }, [blocks, selectedId]);

  const writeBlocks = useCallback(
    (next: ContentBlock[]) => {
      if (!item || !items) return;
      setItems(items.map((i) => (i.id === item.id ? { ...i, blocks: next } : i)));
      setDirty(true);
    },
    [item, items],
  );

  const patchItem = useCallback(
    (patch: Partial<ContentItem>) => {
      if (!item || !items) return;
      setItems(items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
      setDirty(true);
    },
    [item, items],
  );

  /** Zapis całej listy — ta sama droga, którą zapisuje moduł treści. */
  async function save() {
    if (!items) return;
    setSaving(true);
    await saveContentItems({
      data: {
        kind: kind as never,
        items: items.map((i) => ({
          ...i,
          blocks: i.blocks as never,
          fileNames: i.fileNames ?? null,
          popupConfig: i.popupConfig ?? null,
          attachments: i.attachments ?? null,
          senderId: i.senderId ?? "",
        })),
      },
    }).catch(() => null);
    // Przeniesienie **po** zapisie treści: gdyby szło pierwsze, wiersz
    // zniknąłby z listy tego rodzaju i `saveContentItems` (które kasuje cały
    // rodzaj i wstawia od nowa) przywróciłoby go w starym miejscu.
    if (item && target !== kind) {
      const moved = await moveContentItem({ data: { id: item.id, to: target as never } });
      setSaving(false);
      setDirty(false);
      if (!moved.ok) {
        toast.error(tr("Nie przeniesiono"), { description: moved.error });
        return;
      }
      toast.success(tr("Zapisane w module {title}.", { title: KIND_LABELS[target].title }));
      navigate({ to: "/studio", search: { kind: target, id: item.id } });
      return;
    }

    setSaving(false);
    setDirty(false);
    toast.success(tr("Szablon zapisany."));
  }

  /**
   * Upuszczenie na szczelinę o podanym numerze.
   *
   * `index` liczy **przerwy między blokami**, nie bloki: 0 = przed pierwszym,
   * `blocks.length` = na końcu. Ta sama funkcja obsługuje nowy blok z palety
   * i przeniesienie istniejącego — rozstrzyga o tym ładunek.
   */
  const dropAt = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverIndex(null);
    const result = applyDrop(blocks, index, e.dataTransfer.getData("text/plain"));
    if (!result.changed) return;
    writeBlocks(result.blocks);
    if (result.selectId) setSelectedId(result.selectId);
  };

  const dragOverAt = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverIndex(index);
  };

  const addBlock = (type: BlockType) => {
    if (!item) return;
    const block = makeBlock(type);
    const at = blocks.findIndex((b) => b.id === selectedId);
    const next = [...blocks];
    next.splice(at === -1 ? next.length : at + 1, 0, block);
    writeBlocks(next);
    setSelectedId(block.id);
  };

  const updateBlock = (id: string, data: Record<string, string>) =>
    writeBlocks(
      blocks.map((b) => {
        if (b.id === id) return { ...b, data, columns: resizeColumns(b, data) };
        if (!b.columns) return b;
        return {
          ...b,
          columns: b.columns.map((col) => col.map((c) => (c.id === id ? { ...c, data } : c))),
        };
      }),
    );

  const moveBlock = (id: string, dir: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    writeBlocks(next);
  };

  const duplicateBlock = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const copy = makeBlock(blocks[i].type, { ...blocks[i].data });
    copy.columns = blocks[i].columns;
    const next = [...blocks];
    next.splice(i + 1, 0, copy);
    writeBlocks(next);
  };

  const removeBlock = (id: string) => {
    writeBlocks(blocks.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const paletteTypes = new Set(BLOCK_PALETTES[kind].map((b) => b.type));

  /** Rodzaje bloków, których nie ma w palecie modułu docelowego. */
  const unsupported = useMemo(() => {
    if (target === kind) return [];
    const allowed = new Set(BLOCK_PALETTES[target].map((b) => b.type));
    const labels = new Set<string>();
    const walk = (list: ContentBlock[]) => {
      for (const b of list) {
        if (!allowed.has(b.type)) {
          labels.add(BLOCK_PALETTES[kind].find((p) => p.type === b.type)?.label ?? b.type);
        }
        for (const col of b.columns ?? []) walk(col);
      }
    };
    walk(blocks);
    return [...labels];
  }, [blocks, kind, target]);
  // Podgląd czyta te same ustawienia, które renderer wstawi do wysyłanego
  // HTML-a — inaczej płótno pokazywałoby coś innego, niż dostanie pacjent.
  const st = item?.style ?? {};
  const canvasWidth = device === "mobile" ? 375 : Number(st.width) || 600;
  const bg = st.background || "#F4F6F9";
  const contentBg = st.contentBackground || "#FFFFFF";
  // Zero = brak zaokrąglenia, więc `|| 12` odpada (patrz renderer).
  const radius = st.radius?.trim() ? Number(st.radius) : 12;
  const font = st.font || "Inter";

  // Wejście z paska bocznego (bez `?id=`) pokazuje listę projektów, a nie
  // pierwszą z brzegu wiadomość ani pustkę.
  if (!search.id) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{tr("Design Studio")}</h1>
              <Badge variant="secondary" className="rounded-full">
                {tr("Beta")}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {tr("Wszystkie projekty — newslettery, e-maile i pop-upy w jednym miejscu.")}
            </p>
          </div>
        </div>
        <StudioHome onOpen={(k, id) => navigate({ to: "/studio", search: { kind: k, id } })} />
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Studio otwiera istniejącą wiadomość, nie zakłada nowej — zakładanie ma
  // jedno miejsce (moduł kanału), bo tam nadaje się nazwę i status. Bez tego
  // wejście z paska bocznego na pustą listę kończyło się płótnem, na którym
  // każde kliknięcie nic nie robi.
  if (loadError) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-24 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          {tr("Nie udało się wczytać wiadomości")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tr("Lista nie jest pusta — to serwer nie odpowiedział. Treść błędu:")}
        </p>
        <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-3 text-left text-[11px]">
          {loadError}
        </pre>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-24 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold tracking-tight">{tr("Nie ma czego otworzyć")}</h1>
        <p className="text-sm text-muted-foreground">
          {tr(
            'Studio edytuje wiadomości założone w module kanału. Utwórz tam pierwszą, a potem wróć tutaj albo wybierz „Otwórz w Studiu" z jej menu.',
          )}
        </p>
        <Button
          variant="outline"
          className="gap-1.5"
          onClick={() => navigate({ to: backTo(kind) })}
        >
          <ArrowLeft className="h-4 w-4" />
          {tr("Przejdź do modułu ")} {KIND_LABELS[kind].title}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Czcionki treści wczytywane tylko tutaj — patrz nota w ContentSectionPage. */}
      <link rel="stylesheet" href={studioFontsHref(STUDIO_FONTS.map((f) => f.family))} />

      {/* ── pasek górny ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            title={tr("Wróć do listy projektów")}
            onClick={() => navigate({ to: "/studio", search: {} })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{tr("Design Studio")}</h1>
              <Badge variant="secondary" className="rounded-full">
                {tr("Beta")}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {item ? `„${item.name}"` : tr("Brak wiadomości")} ·{" "}
              {item?.status === "ready" ? "gotowy" : tr("wersja robocza")} ·{" "}
              {dirty ? tr("niezapisane zmiany") : "zapisano"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-border/60 p-0.5">
            <Button
              variant={device === "desktop" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setDevice("desktop")}
            >
              <Monitor className="h-4 w-4" /> {tr(" Desktop")}
            </Button>
            <Button
              variant={device === "mobile" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setDevice("mobile")}
            >
              <Smartphone className="h-4 w-4" /> {tr(" Mobile")}
            </Button>
          </div>
          {/* Pop-up nie ma testu na skrzynkę — nie wychodzi pocztą. Ma za to
              ustawienia wyświetlania, których e-mail nie potrzebuje. */}
          {kind === "popup" ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              disabled={!item}
              onClick={() => setPopupOpen(true)}
            >
              <Settings2 className="h-4 w-4" /> {tr(" Wyświetlanie")}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              disabled={!item}
              onClick={() => setTestOpen(true)}
            >
              <Send className="h-4 w-4" /> {tr(" Wyślij test")}
            </Button>
          )}
          {/* Wybór modułu przy zapisie. Domyślnie ten, z którego wiadomość
              otwarto — przeniesienie ma być decyzją, nie skutkiem ubocznym. */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{tr("Zapisz w")}</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as BuilderKind)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="newsletter">{tr("Newsletter")}</option>
              <option value="email">{tr("E-mail")}</option>
              <option value="popup">{tr("Pop-Up")}</option>
            </select>
          </div>
          <Button size="sm" className="h-9 gap-1.5" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {target === kind
              ? tr("Zapisz")
              : tr("Przenieś do {title}", { title: KIND_LABELS[target].title })}
          </Button>
        </div>
      </div>

      {/* Bloki, których moduł docelowy nie ma w palecie. Nie kasujemy ich przy
          przenoszeniu — ale przemilczenie tego dałoby wiadomość, która po
          przełożeniu wygląda inaczej, niż wyglądała przed chwilą. */}
      {target !== kind && unsupported.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
          <b>{KIND_LABELS[target].title}</b> {tr(" nie obsługuje")}{" "}
          {unsupported.length === 1 ? "bloku" : tr("bloków")}: {unsupported.join(", ")}
          {tr(". Bloki zostaną w wiadomości, ale nie pojawią się w treści po przeniesieniu.")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        {/* ── panel lewy ───────────────────────────────────────────────── */}
        <Card className="overflow-hidden border-border/60 shadow-[var(--shadow-card)]">
          <CardContent className="p-0">
            <Tabs defaultValue="blocks">
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-none border-b border-border/60 bg-transparent p-0">
                {[
                  { v: "blocks", i: Blocks, l: "Bloki" },
                  { v: "sections", i: Layers, l: "Sekcje" },
                  { v: "styles", i: Palette, l: "Style" },
                ].map((t) => (
                  <TabsTrigger
                    key={t.v}
                    value={t.v}
                    className="flex-col gap-1 rounded-none border-b-2 border-transparent py-2.5 text-[11px] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    <t.i className="h-4 w-4" />
                    {t.l}
                  </TabsTrigger>
                ))}
              </TabsList>

              <ScrollArea className="h-[62vh]">
                <TabsContent value="blocks" className="m-0 space-y-5 p-4">
                  <p className="text-xs text-muted-foreground">
                    {tr("Kliknij, aby dodać moduł pod zaznaczonym blokiem.")}
                  </p>
                  {PALETTE_GROUPS.map((g) => {
                    const available = g.types.filter((t) => paletteTypes.has(t));
                    if (available.length === 0) return null;
                    return (
                      <div key={g.label} className="space-y-2">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {g.label}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {available.map((type) => {
                            const meta = BLOCK_PALETTES[kind].find((b) => b.type === type);
                            if (!meta) return null;
                            return (
                              <button
                                key={type}
                                draggable
                                onDragStart={(e) =>
                                  e.dataTransfer.setData("text/plain", paletteDragPayload(type))
                                }
                                // Kliknięcie zostaje obok przeciągania: przy
                                // dziesiątym bloku dokładanie na koniec jednym
                                // kliknięciem jest szybsze niż celowanie myszą.
                                onClick={() => addBlock(type)}
                                className="flex cursor-grab flex-col items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card px-1.5 py-3 text-center text-[10px] leading-tight transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-card)] active:cursor-grabbing"
                              >
                                <meta.icon className="h-4 w-4 text-primary" />
                                <span className="line-clamp-2">{meta.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  <div>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {tr("Integracje")}
                    </div>
                    <StudioIntegrationsPanel
                      onImported={(img) => {
                        // Projekt jest już w Media — otwieramy rozmowę
                        // z agentem z tą grafiką. Rozmowę, a nie jednorazowe
                        // „zakoduj": pierwszy wynik prawie nigdy nie jest
                        // ostatnim, a poprawki mają iść od niego, nie od zera.
                        setCanvaImage({ mediaId: img.mediaId, name: img.name });
                        setAgentOpen(true);
                      }}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="sections" className="m-0 p-4">
                  <StudioSectionsPanel
                    onInsert={(section: ContentBlock[]) => {
                      if (!item) return;
                      const at = blocks.findIndex((b) => b.id === selectedId);
                      const next = [...blocks];
                      next.splice(at === -1 ? next.length : at + 1, 0, ...section);
                      writeBlocks(next);
                      setSelectedId(section[0]?.id ?? null);
                    }}
                  />
                </TabsContent>

                <TabsContent value="styles" className="m-0 p-4">
                  <StudioStylesPanel item={item} onChange={patchItem} />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </CardContent>
        </Card>

        {/* ── płótno ───────────────────────────────────────────────────── */}
        <Card className="overflow-hidden border-border/60 shadow-[var(--shadow-card)]">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="rounded-full text-[10px]">
                  {count(blocks.length, "blok", "bloki", "bloków")}
                </Badge>
                {items.length > 1 && (
                  <select
                    value={itemId}
                    onChange={(e) => {
                      navigate({ to: "/studio", search: { kind, id: e.target.value } });
                      setSelectedId(null);
                    }}
                    className="h-7 max-w-[220px] rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setZoom((z) => Math.max(50, z - 10))}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="w-10 text-center text-xs tabular-nums">{zoom}%</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setZoom((z) => Math.min(150, z + 10))}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Treść z archiwum ZIP albo wklejona jako kod nie ma bloków —
                pokazywanie dla niej pustego płótna sugerowało, że treści nie
                ma. Patrz nota w `StudioHtmlEditor`. */}
            {item && item.source !== "blocks" ? (
              <div className="p-4">
                <StudioHtmlEditor item={item} onChange={(html) => patchItem({ html })} />
              </div>
            ) : (
              <ScrollArea className="h-[62vh]">
                <div className="flex justify-center p-6" style={{ background: bg }}>
                  <div
                    className="origin-top transition-all"
                    style={{ width: canvasWidth, transform: `scale(${zoom / 100})` }}
                  >
                    <div
                      className="overflow-hidden shadow-[var(--shadow-elevated)]"
                      style={{ background: contentBg, borderRadius: radius, fontFamily: font }}
                    >
                      {blocks.length === 0 && (
                        <div
                          onDragOver={dragOverAt(0)}
                          onDragLeave={() => setOverIndex(null)}
                          onDrop={dropAt(0)}
                          className={cn(
                            "m-4 rounded-xl border-2 border-dashed px-6 py-12 text-center text-xs transition-colors",
                            overIndex === 0
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {tr("Pusto. Przeciągnij blok z panelu po lewej albo kliknij go.")}
                        </div>
                      )}

                      {blocks.map((b, i) => (
                        <div key={b.id}>
                          <DropSlot
                            active={overIndex === i}
                            onDragOver={dragOverAt(i)}
                            onDragLeave={() => setOverIndex(null)}
                            onDrop={dropAt(i)}
                          />
                          <StudioBlockRow
                            block={b}
                            index={i}
                            active={selectedId === b.id}
                            first={i === 0}
                            last={i === blocks.length - 1}
                            onSelect={() => setSelectedId(b.id)}
                            onMove={(d) => moveBlock(b.id, d)}
                            onDuplicate={() => duplicateBlock(b.id)}
                            onRemove={() => removeBlock(b.id)}
                            onEdit={(html) => updateBlock(b.id, inlinePatch(b, html))}
                          />
                        </div>
                      ))}

                      {blocks.length > 0 && (
                        <DropSlot
                          active={overIndex === blocks.length}
                          onDragOver={dragOverAt(blocks.length)}
                          onDragLeave={() => setOverIndex(null)}
                          onDrop={dropAt(blocks.length)}
                          tall
                        />
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* ── panel prawy ──────────────────────────────────────────────── */}
        <Card className="overflow-hidden border-border/60 shadow-[var(--shadow-card)]">
          <CardContent className="p-0">
            <Tabs defaultValue="inspector">
              <TabsList className="grid h-auto w-full grid-cols-2 rounded-none border-b border-border/60 bg-transparent p-0">
                {[
                  { v: "inspector", l: tr("Właściwości") },
                  { v: "qa", l: "Testy" },
                ].map((t) => (
                  <TabsTrigger
                    key={t.v}
                    value={t.v}
                    className="rounded-none border-b-2 border-transparent py-2.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    {t.l}
                  </TabsTrigger>
                ))}
              </TabsList>

              <ScrollArea className="h-[62vh]">
                <TabsContent value="inspector" className="m-0 space-y-4 p-4">
                  {selected ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="rounded-full text-[10px]">
                          {BLOCK_PALETTES[kind].find((b) => b.type === selected.type)?.label ??
                            selected.type}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          #{selected.id.slice(-4)}
                        </span>
                      </div>
                      <BlockInspector
                        block={selected}
                        onUpdate={(data) => updateBlock(selected.id, data)}
                      />
                      <Separator />
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => duplicateBlock(selected.id)}
                        >
                          <Copy className="h-3.5 w-3.5" /> {tr(" Duplikuj")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-destructive"
                          onClick={() => removeBlock(selected.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {tr(" Usuń")}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {tr("Zaznacz blok na płótnie, aby zobaczyć jego ustawienia.")}
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="qa" className="m-0 p-4">
                  <StudioQaPanel item={item} />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <TestSendDialog open={testOpen} onOpenChange={setTestOpen} item={item} />

      {/* Rozmowa z PRM_Agentem nad projektem z Canvy. Wynik **zastępuje** treść
          bieżącej wiadomości: import to początek nowej kreacji, a doklejanie go
          pod spodem dawałoby dwa układy jeden pod drugim. */}
      <CreativeStudioDialog
        open={agentOpen}
        onOpenChange={setAgentOpen}
        kind={kind as never}
        initialImage={canvaImage}
        onSave={({ blocks: nowe }) => {
          writeBlocks(nowe as never);
          setAgentOpen(false);
          toast.success(tr("Projekt z Canvy przeniesiony do Studia."), {
            description: tr("Układ jest teraz klockami — poprawiaj go jak każdą inną wiadomość."),
          });
        }}
      />

      {item && kind === "popup" && (
        <PopupSettingsDialog
          open={popupOpen}
          onOpenChange={setPopupOpen}
          value={popupConfigOf(item)}
          onSave={(config: PopupConfig) => {
            patchItem({ popupConfig: config });
            setPopupOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Szczelina między blokami — miejsce, w które da się upuścić.
 *
 * **Zawsze zajmuje trochę wysokości, nawet gdy nic nie leci.** Szczelina
 * o zerowej wysokości jest praktycznie nietrafialna myszą: kursor przeskakuje
 * ją między dwoma blokami i przeciąganie wygląda na zepsute. Cztery piksele
 * wystarczą, żeby zdarzenie się złapało, i nie widać ich w składzie.
 */
function DropSlot({
  active,
  tall,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  active: boolean;
  tall?: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "mx-4 rounded-full transition-all",
        tall ? "h-6" : "h-1",
        active ? "h-2 bg-primary" : "bg-transparent",
      )}
    />
  );
}

/**
 * Wiersz bloku na płótnie: podgląd plus pasek narzędzi po najechaniu.
 *
 * Kolejność i kasowanie są tu, a nie w panelu po prawej, bo dotyczą miejsca
 * bloku w wiadomości — a to widać wyłącznie na płótnie.
 */
function StudioBlockRow({
  block,
  index,
  active,
  first,
  last,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
  onEdit,
}: {
  block: ContentBlock;
  /** Pozycja na płótnie — trafia do ładunku przeciągania. */
  index: number;
  active: boolean;
  first: boolean;
  last: boolean;
  onSelect: () => void;
  onMove: (d: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onEdit: (html: string) => void;
}) {
  const editing = active && inlineEditable(block);
  return (
    <div
      // Przeciąganie całego wiersza, nie tylko uchwytu: przy bloku obrazu
      // celowanie w sześciopikselowy uchwyt jest niepotrzebną walką z myszą.
      // Uchwyt zostaje jako **wskazówka**, że wiersz da się chwycić.
      // **Wyłączone, gdy blok jest właśnie edytowany w miejscu.** Pole tekstowe
      // wewnątrz elementu z `draggable` traci zaznaczanie myszą: przeciągnięcie
      // po literach zaczyna przenosić blok zamiast zaznaczać wyraz.
      draggable={!editing}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", moveDragPayload(index))}
      onClick={onSelect}
      className={cn(
        "group relative border-2 transition-colors",
        editing ? "cursor-text" : "cursor-grab active:cursor-grabbing",
        active ? "border-primary" : "border-transparent hover:border-primary/30",
      )}
    >
      <div className="absolute left-1 top-1/2 z-10 hidden -translate-y-1/2 text-muted-foreground group-hover:block">
        <GripVertical className="h-4 w-4" />
      </div>
      <div className="absolute right-1.5 top-1.5 z-10 hidden items-center gap-0.5 rounded-lg border border-border/60 bg-card/95 p-0.5 shadow-sm group-hover:flex">
        <IconBtn disabled={first} onClick={() => onMove(-1)}>
          <ArrowUp className="h-3 w-3" />
        </IconBtn>
        <IconBtn disabled={last} onClick={() => onMove(1)}>
          <ArrowDown className="h-3 w-3" />
        </IconBtn>
        <IconBtn onClick={onDuplicate}>
          <Copy className="h-3 w-3" />
        </IconBtn>
        <IconBtn onClick={onRemove}>
          <Trash2 className="h-3 w-3 text-destructive" />
        </IconBtn>
      </div>

      <div className="px-6 py-2">
        {editing ? (
          <div onClick={(e) => e.stopPropagation()}>
            <RichTextEditor
              value={inlineValue(block)}
              onChange={onEdit}
              minHeight={40}
              toolbar={false}
              className="rounded-sm px-0 py-0 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 [&_p]:m-0"
            />
          </div>
        ) : (
          <BlockPreview block={block} />
        )}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded-md p-1 hover:bg-muted disabled:opacity-30"
    >
      {children}
    </button>
  );
}
