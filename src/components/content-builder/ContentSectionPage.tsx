import { warsawToday } from "@/lib/visits/warsaw-time";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Blocks,
  Bot,
  Code2,
  Eye,
  FileArchive,
  FileCode2,
  ArrowLeft,
  Copy as CopyIcon,
  FileText,
  Globe,
  MessageSquare,
  MoreHorizontal,
  Newspaper,
  Paperclip,
  PenTool,
  Pencil,
  Plus,
  Send,
  Send as SendIcon,
  Settings2,
  Trash2,
  Type,
  Workflow,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { BlockEditor } from "@/components/content-builder/BlockEditor";
import { ImportZipDialog } from "@/components/content-builder/ImportZipDialog";
import { TestSendDialog } from "@/components/content-builder/TestSendDialog";
import { SmsBodyEditor } from "@/components/content-builder/SmsBodyEditor";
import { SmsTestSendDialog } from "@/components/content-builder/SmsTestSendDialog";
import {
  getContentItems,
  saveContentItems,
  importLocalContentItems,
  seedContentItemsOnce,
} from "@/lib/api/content-items.functions";
import { PopupSettingsDialog } from "@/components/content-builder/PopupSettingsDialog";
import { PopupPreviewDialog } from "@/components/content-builder/PopupPreviewDialog";
import { CreativeStudioDialog } from "@/components/content-builder/CreativeStudioDialog";
import { AttachmentsDialog } from "@/components/content-builder/AttachmentsDialog";
import { getEmailSenders, type EmailSenderRow } from "@/lib/api/email-senders.functions";
import { HtmlSourceDialog } from "@/components/content-builder/HtmlSourceDialog";
import { FormGuideDialog } from "@/components/content-builder/FormGuideDialog";
import { renderContentItemToFragment } from "@/lib/content-builder-html";
import {
  getActivePopups,
  activatePopup,
  getPopupStats,
  deactivatePopup,
  reorderPopups,
  type ActivePopup,
} from "@/lib/api/popup.functions";
import { getAllAutomations } from "@/lib/api/automation.functions";
import { count } from "@/lib/plural";
import {
  KIND_LABELS,
  newDraftItem,
  blockId,
  STUDIO_FONTS,
  studioFontsHref,
  popupConfigOf,
  POPUP_FORMAT_LABELS,
  type BuilderKind,
  type ContentItem,
  type ContentBlock,
  type PopupConfig,
} from "@/lib/content-builder";
import { intlLocale, t } from "@/lib/i18n";

function storageKey(kind: BuilderKind) {
  return `prm-content-${kind}`;
}

/** Znacznik, że zawartość tej przeglądarki została już przeniesiona na serwer. */
function migratedKey(kind: BuilderKind) {
  return `prm-content-${kind}-migrated`;
}

/** Kopia z czasów, gdy treści mieszkały w przeglądarce — czytana raz, przy przenosinach. */
function loadLegacyItems(kind: BuilderKind): ContentItem[] {
  try {
    const raw = localStorage.getItem(storageKey(kind));
    return raw ? (JSON.parse(raw) as ContentItem[]) : [];
  } catch {
    return [];
  }
}

/** Kształt, którego oczekuje serwer — stare wpisy bywają niepełne. */
function forServer(items: ContentItem[]) {
  return items.map((i) => ({
    id: i.id,
    kind: i.kind,
    name: i.name ?? "",
    source: i.source ?? "blocks",
    blocks: (i.blocks ?? []) as unknown[],
    smsBody: i.smsBody ?? "",
    html: i.html ?? "",
    fileNames: i.fileNames ?? null,
    popupConfig: (i.popupConfig ?? null) as unknown,
    status: i.status ?? "draft",
    attachments: i.attachments ?? null,
    // **Te dwa pola wypadały tu z ładunku** — razem z brakiem zapisu po
    // stronie serwera i pominięciem nadawcy w wysyłce testowej dawało to trzy
    // niezależne powody, dla których wybór nadawcy nie działał. Naprawa
    // jednego z nich nic by nie zmieniła.
    senderId: i.senderId ?? "",
    style: i.style ?? null,
    updatedAt: i.updatedAt ?? warsawToday(),
  }));
}

/**
 * Treści z serwera, z **jednorazowym przeniesieniem** tego, co zostało
 * w przeglądarce.
 *
 * Przeniesienie dokłada wyłącznie pozycje o nieznanym `id`, więc druga
 * przeglądarka wchodząca później dorzuca swoje, zamiast nadpisywać cudze.
 * Po przeniesieniu zapada znacznik i stara kopia **nie jest już czytana** —
 * bez tego skasowanie pop-upu na serwerze cofałoby się przy każdym odświeżeniu,
 * bo lokalna kopia wciąż by go miała.
 *
 * Sama kopia zostaje w przeglądarce nietknięta: nic nie kosztuje, a jest
 * ostatnią deską ratunku, gdyby przenosiny poszły źle.
 */
async function loadItems(kind: BuilderKind): Promise<ContentItem[]> {
  try {
    if (!localStorage.getItem(migratedKey(kind))) {
      const legacy = loadLegacyItems(kind);
      if (legacy.length > 0) {
        const r = await importLocalContentItems({ data: { kind, items: forServer(legacy) } });
        if (r.added > 0) {
          toast.success(
            t("Przeniesiono {added} pozycji z tej przeglądarki na serwer.", { added: r.added }),
            {
              description: t(
                "Od teraz widać je wszędzie — na każdym komputerze i w każdej przeglądarce.",
              ),
            },
          );
        }
      }
      localStorage.setItem(migratedKey(kind), new Date().toISOString());
    }
    return await getContentItems({ data: { kind } });
  } catch {
    // Serwer nieosiągalny — lepiej pokazać kopię lokalną niż pustą listę.
    return loadLegacyItems(kind);
  }
}

async function saveItems(kind: BuilderKind, items: ContentItem[]) {
  try {
    await saveContentItems({ data: { kind, items: forServer(items) } });
  } catch {
    toast.error(t("Nie udało się zapisać na serwerze."), {
      description: t(
        "Zmiana jest widoczna na ekranie, ale nie zostanie zapamiętana. Odśwież stronę.",
      ),
    });
  }
}

/** Arkusz czcionek Studia — dla listy wyboru w edytorze. */
const ALL_STUDIO_FONTS_HREF = studioFontsHref(STUDIO_FONTS.map((f) => f.family));

export function ContentSectionPage({
  kind,
  seedItems,
  defaultBlocks,
  toolbarExtra,
}: {
  kind: BuilderKind;
  seedItems: ContentItem[];
  /** Blocks a brand new blank item should start with (e.g. header/footer defaults for email). */
  defaultBlocks?: () => ContentBlock[];
  toolbarExtra?: ReactNode;
}) {
  const navigate = useNavigate();
  const label = KIND_LABELS[kind];
  const [items, setItems] = useState<ContentItem[]>([]);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [zipDialogOpen, setZipDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);
  /** Pop-up otwarty w oknie testowym. Trzymany po id, nie po obiekcie — treść zmienia się w edytorze. */
  const [previewPopupId, setPreviewPopupId] = useState<string | null>(null);
  /** Wyświetlenia i kliknięcia — agregat z całej historii, per treść. */
  const [popupStats, setPopupStats] = useState<
    Record<string, { impressions: number; clicks: number; unique: number; lastAt: number }>
  >({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [testSendItem, setTestSendItem] = useState<ContentItem | null>(null);
  const [activePopups, setActivePopups] = useState<ActivePopup[]>([]);
  /** Item whose switch is mid-flight, so it cannot be toggled twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null);
  /** Names of popups referenced by a `show_popup` node in some automation — drives the "Użyte w procesie" badge. */
  const [popupsInProcess, setPopupsInProcess] = useState<Set<string>>(new Set());
  const [settingsItemId, setSettingsItemId] = useState<string | null>(null);
  const [htmlDialogOpen, setHtmlDialogOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  /** Pozycja, dla której otwarto wybór załączników. Tylko moduł Email. */
  const [attachItemId, setAttachItemId] = useState<string | null>(null);
  /** Pozycja, której zmieniamy nazwę — nazwa jest kluczem w migawkach i węzłach. */
  /** Nazwy nadawcy do wyboru w edytorze — jeden adres, kilka podpisów. */
  const [senders, setSenders] = useState<EmailSenderRow[]>([]);
  const [renameItemId, setRenameItemId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [htmlEditingId, setHtmlEditingId] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (kind !== "email" && kind !== "newsletter") return;
    getEmailSenders()
      .then(setSenders)
      .catch(() => setSenders([]));
  }, [kind]);

  useEffect(() => {
    // Stored items win over seeds with the same id, so edits to a seeded item
    // (its blocks, or a popup's settings) survive a reload — seeds keep their
    // position in the list either way.
    // **Przykłady nie są już doklejane z kodu.** Wsiewamy je raz (i tylko na
    // instalacji demonstracyjnej), po czym lista pochodzi WYŁĄCZNIE z bazy —
    // dzięki temu skasowany przykład zostaje skasowany. Wcześniej wracał przy
    // każdym odświeżeniu, bo pochodził z repozytorium, nie z bazy.
    void seedContentItemsOnce({ data: { kind, items: forServer(seedItems) } })
      .catch(() => ({ seeded: 0 }))
      .then(() => loadItems(kind))
      .then(setItems);

    if (kind === "popup") {
      getActivePopups().then(setActivePopups);
      getPopupStats()
        .then(setPopupStats)
        .catch(() => setPopupStats({}));
      // A popup counts as "used in a process" when an automation action node
      // points at it. Nodes reference content items by *name* (same weak link
      // as email/newsletter templates), so that's what we match on.
      getAllAutomations()
        .then((records) => {
          const names = new Set<string>();
          for (const rec of records) {
            for (const node of rec.flow?.nodes ?? []) {
              if (node.kind === "action" && node.key === "show_popup" && node.config?.template) {
                names.add(node.config.template);
              }
            }
          }
          setPopupsInProcess(names);
        })
        .catch(() => setPopupsInProcess(new Set()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  /** Pushes an item's current content + settings to the live popup slot. Personalization chips are left unresolved here on purpose — /popup-active swaps them per visitor. */
  const publish = (item: ContentItem) =>
    activatePopup({
      data: {
        contentItemId: item.id,
        name: item.name,
        html: renderContentItemToFragment(item, { firstName: "", email: "" }),
        config: popupConfigOf(item),
      },
    });

  const isLive = (id: string) => activePopups.some((p) => p.contentItemId === id);

  const handleTogglePublish = async (item: ContentItem) => {
    // Publishing renders the item and hits the server, so the switch has to be
    // held shut until it lands — otherwise a double click races two writes.
    setTogglingId(item.id);
    try {
      if (isLive(item.id)) {
        await deactivatePopup({ data: { contentItemId: item.id } });
        toast.success(t("Pop-up wyłączony ze strony"));
      } else {
        await publish(item);
        toast.success(t("„{name}” wyświetla się teraz na stronie", { name: item.name }), {
          description:
            activePopups.length > 0
              ? t("Kilka pop-upów jest aktywnych — kolejność decyduje, który zobaczy odwiedzający.")
              : t("Widoczny wszędzie tam, gdzie zainstalowany jest kod śledzący."),
        });
      }
      setActivePopups(await getActivePopups());
    } catch (err) {
      toast.error(t("Nie udało się zmienić statusu pop-upu"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setTogglingId(null);
    }
  };

  const movePriority = async (id: string, dir: -1 | 1) => {
    const order = activePopups.map((p) => p.contentItemId);
    const index = order.indexOf(id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    await reorderPopups({ data: { contentItemIds: order } });
    setActivePopups(await getActivePopups());
  };

  /** Re-publishes silently after an edit, so a popup that's already live reflects the change without toggling it off and on. */
  const republishIfLive = async (item: ContentItem) => {
    if (kind !== "popup" || !isLive(item.id)) return;
    try {
      await publish(item);
    } catch {
      toast.error(t("Zmiany zapisane, ale nie udało się odświeżyć pop-upu na stronie"));
    }
  };

  const persist = (next: ContentItem[]) => {
    // Zapisujemy CAŁĄ listę — bez odsiewania „nietkniętych przykładów".
    // Tamto odsiewanie miało sens, gdy przykłady mieszkały w kodzie; teraz są
    // zwykłymi wierszami i pominięcie ich przy zapisie oznaczałoby ciche
    // kasowanie treści, których użytkownik nie ruszał.
    void saveItems(kind, next);
    setItems(next);
  };

  const editing = items.find((i) => i.id === editingId) ?? null;
  const settingsItem = items.find((i) => i.id === settingsItemId) ?? null;
  const previewPopup = items.find((i) => i.id === previewPopupId) ?? null;

  const createBlank = () => {
    const name = pendingName.trim() || label.newLabel;
    // **Pusty edytor.** Wcześniej nowa wiadomość dostawała gotowy zestaw bloków
    // (nagłówek, tytuł, tekst, stopka), które i tak trzeba było kasować przed
    // wklejeniem własnej treści. Pop-up zostaje z ziarnem: bez żadnego bloku
    // jest oknem, którego nie widać, więc pierwszy krok byłby myleniem.
    const base = newDraftItem(kind, name, kind === "popup" ? (defaultBlocks?.() ?? []) : []);
    const item = kind === "sms" ? { ...base, smsBody: "" } : base;
    persist([item, ...items]);
    setNameDialogOpen(false);
    setPendingName("");
    /**
     * **Newsletter i e-mail idą prosto do Design Studio.** Wcześniej nowa
     * wiadomość otwierała klasyczny edytor, więc Studio było czymś, co trzeba
     * było znaleźć osobno.
     *
     * SMS i pop-up zostają przy swoich edytorach: SMS to jedno pole tekstowe,
     * a pop-up ma własny podgląd okna na stronie.
     */
    if (kind === "newsletter" || kind === "email") {
      navigate({ to: "/studio", search: { kind, id: item.id } });
      return;
    }
    setEditingId(item.id);
  };

  /**
   * Kopia szablonu.
   *
   * Nazwa dostaje przyrostek, bo **nazwa jest kluczem** — pod nią chodzą
   * migawki treści i węzły automatyzacji. Dwie pozycje o tej samej nazwie
   * znaczyłyby, że silnik wysyła którąś z nich, a nie wiadomo którą.
   */
  const duplicateItem = (item: ContentItem) => {
    const used = new Set(items.map((i) => i.name.trim().toLowerCase()));
    let name = `${item.name} — kopia`;
    let n = 2;
    while (used.has(name.trim().toLowerCase())) name = `${item.name} — kopia ${n++}`;
    const copy: ContentItem = {
      ...item,
      id: blockId("item"),
      name,
      // Kopia zawsze zaczyna jako robocza: gotowy szablon, który powstał jednym
      // kliknięciem, zbyt łatwo poszedłby do segmentu przed przeczytaniem.
      status: "draft",
      updatedAt: warsawToday(),
    };
    persist([copy, ...items]);
    toast.success(t("Utworzono kopię „{name}”.", { name: name }));
  };

  const renameItem = () => {
    if (!renameItemId) return;
    const name = renameValue.trim();
    if (!name) return;
    const clash = items.some(
      (i) => i.id !== renameItemId && i.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      toast.error(t("Taka nazwa już jest zajęta."), {
        description: t("Nazwa jest kluczem, po którym wysyłka i automatyzacje odnajdują treść."),
      });
      return;
    }
    const before = items.find((i) => i.id === renameItemId)?.name ?? "";
    persist(
      items.map((i) => (i.id === renameItemId ? { ...i, name, updatedAt: warsawToday() } : i)),
    );
    setRenameItemId(null);
    toast.success(t("Nazwa zmieniona."), {
      description: t(
        "Automatyzacje i wysyłki wskazujące „{before}” trzeba przestawić na nową nazwę.",
        { before: before },
      ),
    });
  };

  const importFromZip = (name: string, html: string | null, fileNames: string[]) => {
    const item: ContentItem = {
      id: blockId("item"),
      kind,
      name,
      source: "zip",
      blocks: [],
      html: html ?? undefined,
      fileNames,
      updatedAt: warsawToday(),
      status: "draft",
    };
    persist([item, ...items]);
    toast.success(t("Zaimportowano „{name}”", { name: name }), {
      description: html
        ? t("Znaleziono plik HTML — otwórz podgląd na liście.")
        : t("Nie znaleziono pliku HTML w archiwum."),
    });
  };

  const saveHtmlItem = (name: string, html: string) => {
    if (htmlEditingId) {
      const next = items.map((i) =>
        i.id === htmlEditingId ? { ...i, html, updatedAt: warsawToday() } : i,
      );
      persist(next);
      const updated = next.find((i) => i.id === htmlEditingId);
      if (updated) republishIfLive(updated);
      toast.success(t("Zapisano kod HTML"));
    } else {
      const item: ContentItem = {
        id: blockId("item"),
        kind,
        name,
        source: "html",
        blocks: [],
        html,
        popupConfig: popupConfigOf({} as ContentItem),
        updatedAt: warsawToday(),
        status: "draft",
      };
      persist([item, ...items]);
      toast.success(t("Utworzono „{name}” z własnego HTML-a", { name: name }));
    }
    setHtmlEditingId(null);
  };

  const saveSettings = (config: PopupConfig) => {
    if (!settingsItemId) return;
    const next = items.map((i) => (i.id === settingsItemId ? { ...i, popupConfig: config } : i));
    persist(next);
    const updated = next.find((i) => i.id === settingsItemId);
    if (updated) republishIfLive(updated);
    toast.success(t("Zapisano ustawienia pop-upu"));
  };

  const openItem = (item: ContentItem) => {
    if (item.source === "html") {
      // Treść wklejona jako HTML ma własny edytor kodu — Studio nie rozłoży jej
      // na bloki, bo nigdy z bloków nie powstała.
      setHtmlEditingId(item.id);
      setHtmlDialogOpen(true);
    } else if (item.source === "zip") {
      setPreviewItem(item);
    } else if (kind === "newsletter" || kind === "email") {
      // Jedna droga edycji zamiast dwóch — patrz komentarz przy `createBlank`.
      navigate({ to: "/studio", search: { kind, id: item.id } });
    } else {
      setEditingId(item.id);
    }
  };

  const updateEditingBlocks = (blocks: ContentBlock[]) => {
    if (!editingId) return;
    persist(
      items.map((i) => (i.id === editingId ? { ...i, blocks, updatedAt: warsawToday() } : i)),
    );
  };

  const updateEditingSmsBody = (smsBody: string) => {
    if (!editingId) return;
    persist(
      items.map((i) => (i.id === editingId ? { ...i, smsBody, updatedAt: warsawToday() } : i)),
    );
  };

  const confirmDelete = () => {
    if (!deleteTargetId) return;
    persist(items.filter((i) => i.id !== deleteTargetId));
    setDeleteTargetId(null);
    toast.success(t("Usunięto"));
  };

  /** Zapis i wyjście z edytora — wspólne dla przycisku i paska górnego. */
  const saveAndClose = () => {
    if (editingId) {
      const next = items.map((i) => (i.id === editingId ? { ...i, status: "ready" as const } : i));
      persist(next);
      const updated = next.find((i) => i.id === editingId);
      if (updated) republishIfLive(updated);
    }
    setEditingId(null);
    toast.success(t("Zapisano"));
  };

  // ── Edytor treści: PEŁNA STRONA, nie okno modalne ─────────────────────────
  //
  // Czcionki Google wczytujemy TYLKO na stronie edytora, nie w całej aplikacji:
  // to jeden arkusz na kilkadziesiąt rodzin i nie ma powodu, żeby płaciła za
  // niego lista kontaktów. Sam arkusz nie ściąga plików — te lecą dopiero dla
  // rodzin realnie użytych na płótnie.
  //
  // Wcześniej edytor otwierał się jako `Dialog` nałożony na listę. Przy
  // kreatorze drag&drop, który zajmuje 1100 px i 85% wysokości, „okno" było
  // fikcją — a wyglądało jak wyskakujący komunikat, łatwy do wzięcia za pop-up
  // włączający się sam po dodaniu wiadomości. Pełna strona
  // z paskiem powrotu to ten sam układ, co kreator segmentów i automatyzacji.
  if (editing) {
    return (
      <>
        <link rel="stylesheet" href={ALL_STUDIO_FONTS_HREF} />
        <div className="-m-4 md:-m-8 flex flex-col h-[calc(100vh-4rem)] bg-muted/30">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 md:px-6 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={t("Wróć do listy")}
                onClick={() => setEditingId(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold tracking-tight truncate">{editing.name}</h1>
                <p className="text-xs text-muted-foreground">
                  {kind === "sms"
                    ? t("Wpisz treść wiadomości SMS.")
                    : t("Przeciągaj bloki z lewej strony na płótno, klikaj, aby edytować.")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Nazwa nadawcy tylko przy wiadomościach e-mail: newsletter idzie
                  tą samą drogą, ale pop-up nie ma nadawcy, a SMS ma własnych
                  (Integracje → SMS API). */}
              {(kind === "email" || kind === "newsletter") && senders.length > 0 && (
                <select
                  value={editing.senderId ?? ""}
                  onChange={(e) =>
                    persist(
                      items.map((i) =>
                        i.id === editing.id
                          ? { ...i, senderId: e.target.value, updatedAt: warsawToday() }
                          : i,
                      ),
                    )
                  }
                  title={t("Nazwa, którą pacjent zobaczy w skrzynce")}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">
                    {t("Nadawca: domyślny")}
                    {senders.find((x) => x.isDefault === 1)
                      ? ` (${senders.find((x) => x.isDefault === 1)!.name})`
                      : ""}
                  </option>
                  {senders.map((x) => (
                    <option key={x.id} value={x.id}>
                      {t("Nadawca: ")} {x.name}
                    </option>
                  ))}
                </select>
              )}
              {kind !== "popup" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setTestSendItem(editing)}
                >
                  <Send className="h-3.5 w-3.5" /> {t(" Wyślij testową wiadomość")}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                {t("Zamknij")}
              </Button>
              <Button size="sm" onClick={saveAndClose}>
                {t("Zapisz jako gotowy")}
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
            {kind === "sms" ? (
              <div className="mx-auto max-w-lg">
                <SmsBodyEditor value={editing.smsBody ?? ""} onChange={updateEditingSmsBody} />
              </div>
            ) : (
              <div className="h-full">
                <BlockEditor
                  kind={kind}
                  blocks={editing.blocks}
                  onChange={updateEditingBlocks}
                  narrow={kind === "popup"}
                />
              </div>
            )}
          </div>
        </div>

        {/* Okna wysyłki testowej muszą jechać razem z edytorem — po wczesnym
            return te z listy nie są renderowane. */}
        {kind === "sms" ? (
          <SmsTestSendDialog
            open={!!testSendItem}
            onOpenChange={(o) => !o && setTestSendItem(null)}
            item={testSendItem}
          />
        ) : (
          <TestSendDialog
            open={!!testSendItem}
            onOpenChange={(o) => !o && setTestSendItem(null)}
            item={testSendItem}
            narrow={kind === "popup"}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{label.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{label.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {toolbarExtra}
          {kind === "popup" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setGuideOpen(true)}
              >
                <FileCode2 className="h-4 w-4" /> {t(" Formularze — instrukcja")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setHtmlEditingId(null);
                  setHtmlDialogOpen(true);
                }}
              >
                <Code2 className="h-4 w-4" /> {t(" Wklej HTML")}
              </Button>
            </>
          )}
          {/* Studio kreacji — Email, Newsletter i Pop-Up. POZA blokiem
              `kind === "popup"` wyżej: pierwsza wersja siedziała w nim
              i przycisk istniał tylko w Pop-Upie, choć dialog był zamontowany
              we wszystkich trzech modułach. SMS odpada — nie ma czego kodować. */}
          {kind !== "sms" && (
            <Button size="sm" className="gap-1.5" onClick={() => setStudioOpen(true)}>
              <Bot className="h-4 w-4" /> {t(" PRM_Agent — zakoduj z grafiki")}
            </Button>
          )}
          {kind !== "sms" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setZipDialogOpen(true)}
            >
              <FileArchive className="h-4 w-4" /> {t(" Importuj z ZIP")}
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setNameDialogOpen(true)}>
            <Plus className="h-4 w-4" /> {label.newLabel}
          </Button>
        </div>
      </div>

      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">{t("Lista")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {items.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {kind === "sms"
                ? t("Brak pozycji — stwórz {singular} od zera.", { singular: label.singular })
                : t("Brak pozycji — stwórz {singular} od zera lub zaimportuj z pliku ZIP.", {
                    singular: label.singular,
                  })}
            </div>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-4 py-3 first:pt-0 last:pb-0 group cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors"
              onClick={() => openItem(item)}
            >
              <div className="h-10 w-10 rounded-xl bg-primary-soft flex items-center justify-center text-primary shrink-0">
                {kind === "newsletter" ? (
                  <Newspaper className="h-5 w-5" />
                ) : kind === "sms" ? (
                  <MessageSquare className="h-5 w-5" />
                ) : item.source === "zip" ? (
                  <FileArchive className="h-5 w-5" />
                ) : item.source === "html" ? (
                  <Code2 className="h-5 w-5" />
                ) : (
                  <Blocks className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1 min-w-[180px]">
                <div className="font-medium text-sm group-hover:text-primary transition-colors">
                  {item.name}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {item.source === "zip"
                    ? t("Import ZIP · {v0}", {
                        v0: count(item.fileNames?.length ?? 0, "plik", "pliki", "plików"),
                      })
                    : item.source === "html"
                      ? t("Własny kod HTML")
                      : kind === "sms"
                        ? t("{length} znaków", { length: (item.smsBody ?? "").length })
                        : count(item.blocks.length, "blok", "bloki", "bloków")}
                  {kind === "popup" &&
                    (() => {
                      const cfg = popupConfigOf(item);
                      const rules = cfg.urlRules.filter((r) => r.trim());
                      const scope =
                        cfg.urlMode === "match"
                          ? rules.length === 1
                            ? rules[0]
                            : `${rules.length} adresy`
                          : t("cały serwis");
                      return ` · ${POPUP_FORMAT_LABELS[cfg.format].label.toLowerCase()} · ${scope}`;
                    })()}
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {item.updatedAt}
              </span>
              {/* Statystyka pokazywana **zawsze**, także przy zerze.
                  Ukrywanie jej przy braku danych było błędem: „nic nie widać"
                  wyglądało identycznie jak „funkcja nie działa", a tego z ekranu
                  nie da się rozstrzygnąć. Zero z podpisem odpowiada na oba
                  pytania naraz. */}
              {kind === "popup" &&
                (() => {
                  const st = popupStats[item.id];
                  const shown = st?.impressions ?? 0;
                  if (shown === 0) {
                    return (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {isLive(item.id)
                          ? t("0 wyświetleń — czeka na ruch")
                          : t("0 wyświetleń — nieaktywny")}
                      </span>
                    );
                  }
                  // Skuteczność liczona z wyświetleń, nie z osób: pytanie brzmi
                  // „ile pokazów skończyło się reakcją", a nie „ilu ludzi".
                  const ctr = ((st.clicks / shown) * 100).toFixed(1).replace(".", ",");
                  return (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {shown.toLocaleString(intlLocale())} {t(" wyświetleń ·")}{" "}
                      {st.clicks.toLocaleString(intlLocale())} {t(" kliknięć · ")} {ctr}%
                      {st.unique > 0 &&
                        t(" · {v0} osób", { v0: st.unique.toLocaleString(intlLocale()) })}
                    </span>
                  );
                })()}
              {kind === "popup" && popupsInProcess.has(item.name) && (
                <Badge
                  variant="outline"
                  className="gap-1 border-violet-300 text-violet-700 bg-violet-50"
                >
                  <Workflow className="h-3 w-3" /> {t(" Użyte w procesie")}
                </Badge>
              )}
              {kind === "popup" && (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {/* Same shape as the automation list: status badge + switch, so
                      "is this thing running?" is answered identically everywhere. */}
                  {isLive(item.id) ? (
                    <Badge className="bg-primary text-primary-foreground gap-1 uppercase text-[10px] tracking-wider">
                      <Globe className="h-3 w-3" /> {t(" Aktywny")}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-muted text-muted-foreground uppercase text-[10px] tracking-wider"
                    >
                      {t("Nieaktywny")}
                    </Badge>
                  )}
                  <Switch
                    checked={isLive(item.id)}
                    disabled={togglingId === item.id}
                    onCheckedChange={() => void handleTogglePublish(item)}
                    title={
                      isLive(item.id)
                        ? t("Wyłącz wyświetlanie na stronie")
                        : t("Zacznij wyświetlać na stronie")
                    }
                  />
                  {isLive(item.id) && activePopups.length > 1 && (
                    <span className="inline-flex items-center rounded-md border border-border">
                      <span
                        className="px-1.5 text-[11px] text-muted-foreground border-r border-border"
                        title={t("Kolejność wyświetlania")}
                      >
                        {activePopups.findIndex((p) => p.contentItemId === item.id) + 1}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-none"
                        title={t("Wyżej w kolejności")}
                        disabled={activePopups[0]?.contentItemId === item.id}
                        onClick={() => movePriority(item.id, -1)}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-none"
                        title={t("Niżej w kolejności")}
                        disabled={activePopups[activePopups.length - 1]?.contentItemId === item.id}
                        onClick={() => movePriority(item.id, 1)}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </span>
                  )}
                </div>
              )}
              <Badge
                variant="outline"
                className={
                  item.status === "ready"
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-muted text-muted-foreground"
                }
              >
                {item.status === "ready" ? t("Gotowy") : t("Wersja robocza")}
              </Badge>
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
                  {item.source !== "zip" && (
                    <DropdownMenuItem onClick={() => openItem(item)} className="gap-2">
                      <Pencil className="h-3.5 w-3.5" /> {t(" Edytuj")}
                    </DropdownMenuItem>
                  )}
                  {/* Osobna pozycja tylko tam, gdzie „Edytuj" prowadzi gdzie
                      indziej: przy SMS-ie i pop-upie. Newsletter i e-mail
                      otwierają się w Studiu z obu miejsc, więc druga pozycja
                      byłaby tym samym pod inną nazwą. */}
                  {item.source !== "zip" && kind !== "newsletter" && kind !== "email" && (
                    <DropdownMenuItem
                      onClick={() => navigate({ to: "/studio", search: { kind, id: item.id } })}
                      className="gap-2"
                    >
                      <PenTool className="h-3.5 w-3.5" /> {t(" Otwórz w Studiu")}
                    </DropdownMenuItem>
                  )}
                  {item.source === "zip" && (
                    <DropdownMenuItem onClick={() => setPreviewItem(item)} className="gap-2">
                      <Eye className="h-3.5 w-3.5" /> {t(" Podgląd")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      setRenameValue(item.name);
                      setRenameItemId(item.id);
                    }}
                    className="gap-2"
                  >
                    <Type className="h-3.5 w-3.5" /> {t(" Zmień nazwę")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => duplicateItem(item)} className="gap-2">
                    <CopyIcon className="h-3.5 w-3.5" /> {t(" Duplikuj")}
                  </DropdownMenuItem>
                  {/* Załączniki wyłącznie w module Email — uzasadnienie
                      w nagłówku `AttachmentsDialog`. */}
                  {kind === "email" && (
                    <DropdownMenuItem onClick={() => setAttachItemId(item.id)} className="gap-2">
                      <Paperclip className="h-3.5 w-3.5" /> {t(" Załączniki")}
                      {(item.attachments?.length ?? 0) > 0 && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {item.attachments?.length}
                        </span>
                      )}
                    </DropdownMenuItem>
                  )}
                  {kind === "popup" && (
                    <DropdownMenuItem onClick={() => setPreviewPopupId(item.id)} className="gap-2">
                      <Eye className="h-3.5 w-3.5" /> {t(" Podgląd — jak zobaczy go gość")}
                    </DropdownMenuItem>
                  )}
                  {kind === "popup" && (
                    <DropdownMenuItem onClick={() => setSettingsItemId(item.id)} className="gap-2">
                      <Settings2 className="h-3.5 w-3.5" /> {t(" Ustawienia")}
                    </DropdownMenuItem>
                  )}
                  {/* Pop-up nie jest wysyłką — wyświetla się na stronie, więc
                      nie ma dokąd go „wysłać”. Reszta kanałów ma segment. */}
                  {kind !== "popup" && (
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={() =>
                        navigate({ to: "/send", search: { kind, template: item.name } })
                      }
                    >
                      <SendIcon className="h-3.5 w-3.5" /> {t(" Wyślij do…")}
                    </DropdownMenuItem>
                  )}
                  {/* Publishing lives on the switch in the row, like an
                      automation's — one control per decision, not two. */}
                  <DropdownMenuItem
                    onClick={() => setDeleteTargetId(item.id)}
                    className="text-destructive focus:text-destructive gap-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t(" Usuń")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Name prompt for a new blank item */}
      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{label.newLabel}</DialogTitle>
            <DialogDescription>
              {t("Podaj nazwę, aby otworzyć edytor drag&drop.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Nazwa")}</Label>
            <Input
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              placeholder={t("np. {title} — lipiec 2026", { title: label.title })}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && createBlank()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNameDialogOpen(false)}>
              {t("Anuluj")}
            </Button>
            <Button size="sm" onClick={createBlank}>
              {t("Utwórz")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zmiana nazwy szablonu. Osobne okno, bo nazwa jest kluczem dla migawek
          i węzłów automatyzacji — zmiana „w locie" na liście zbyt łatwo
          zerwałaby powiązanie bez ostrzeżenia. */}
      <Dialog
        open={!!renameItemId}
        onOpenChange={(o) => {
          if (!o) setRenameItemId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Zmień nazwę")}</DialogTitle>
            <DialogDescription>
              {t(
                "Pod tą nazwą wysyłka i automatyzacje odnajdują treść. Po zmianie trzeba je przestawić na nową.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Nazwa")}</Label>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && renameItem()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameItemId(null)}>
              {t("Anuluj")}
            </Button>
            <Button size="sm" disabled={!renameValue.trim()} onClick={renameItem}>
              {t("Zapisz nazwę")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportZipDialog
        open={zipDialogOpen}
        onOpenChange={setZipDialogOpen}
        kind={kind}
        onImport={importFromZip}
      />

      <HtmlSourceDialog
        open={htmlDialogOpen}
        onOpenChange={(o) => {
          setHtmlDialogOpen(o);
          if (!o) setHtmlEditingId(null);
        }}
        onSave={saveHtmlItem}
        mode={htmlEditingId ? "edit" : "create"}
        initialName={htmlEditingId ? (items.find((i) => i.id === htmlEditingId)?.name ?? "") : ""}
        initialHtml={htmlEditingId ? (items.find((i) => i.id === htmlEditingId)?.html ?? "") : ""}
      />

      <FormGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />

      {kind === "email" && (
        <AttachmentsDialog
          open={!!attachItemId}
          onOpenChange={(o) => !o && setAttachItemId(null)}
          selected={items.find((i) => i.id === attachItemId)?.attachments ?? []}
          onSave={(ids) => {
            const next = items.map((i) =>
              i.id === attachItemId ? { ...i, attachments: ids, updatedAt: warsawToday() } : i,
            );
            persist(next);
            toast.success(
              ids.length === 0
                ? t("Załączniki usunięte.")
                : t("Dopięto {v0}.", { v0: count(ids.length, "plik", "pliki", "plików") }),
            );
          }}
        />
      )}

      {(kind === "email" || kind === "newsletter" || kind === "popup") && (
        <CreativeStudioDialog
          open={studioOpen}
          onOpenChange={setStudioOpen}
          kind={kind}
          onSave={({ name, blocks }) => {
            // **Zapis jako klocki (`source: "blocks"`), nie jako HTML.** To jest
            // sedno tego podejścia: pozycja otwiera się w edytorze
            // przeciągnij-i-upuść, więc placówka poprawia układ sama, zamiast
            // prosić agenta o kolejną wersję. HTML powstaje dopiero przy
            // publikacji i wysyłce — tym samym rendererem co treści układane ręcznie.
            const item: ContentItem = {
              id: blockId("item"),
              kind,
              name,
              source: "blocks",
              blocks: blocks as ContentItem["blocks"],
              popupConfig: popupConfigOf({} as ContentItem),
              updatedAt: warsawToday(),
              status: "draft",
            };
            persist([item, ...items]);
            setEditingId(item.id);
            toast.success(t('„{name}" — otwieram w edytorze', { name: name }), {
              description: t("Układ możesz teraz poprawić przeciąganiem klocków."),
            });
          }}
        />
      )}

      {previewPopup && (
        <PopupPreviewDialog
          open={!!previewPopupId}
          onOpenChange={(o) => !o && setPreviewPopupId(null)}
          name={previewPopup.name}
          // Ta sama treść, którą wysłałaby publikacja — podgląd pokazuje to, co
          // naprawdę pójdzie na stronę, a nie osobne renderowanie „na oko".
          html={renderContentItemToFragment(previewPopup, {
            firstName: "Anna",
            email: "anna@example.com",
          })}
          config={popupConfigOf(previewPopup)}
        />
      )}

      {settingsItem && (
        <PopupSettingsDialog
          open={!!settingsItemId}
          onOpenChange={(o) => !o && setSettingsItemId(null)}
          value={popupConfigOf(settingsItem)}
          onSave={saveSettings}
        />
      )}

      {/* Block editor (or plain-text SMS editor) */}
      {kind === "sms" ? (
        <SmsTestSendDialog
          open={!!testSendItem}
          onOpenChange={(o) => !o && setTestSendItem(null)}
          item={testSendItem}
        />
      ) : (
        <TestSendDialog
          open={!!testSendItem}
          onOpenChange={(o) => !o && setTestSendItem(null)}
          item={testSendItem}
          narrow={kind === "popup"}
        />
      )}

      {/* ZIP preview */}
      <Dialog open={!!previewItem} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <DialogTitle>{previewItem?.name}</DialogTitle>
              <DialogDescription>
                {t("Podgląd zaimportowanego pliku HTML z archiwum ZIP.")}
              </DialogDescription>
            </div>
            {kind !== "popup" && previewItem && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 mr-6 shrink-0"
                onClick={() => setTestSendItem(previewItem)}
              >
                <Send className="h-3.5 w-3.5" /> {t(" Wyślij testową wiadomość")}
              </Button>
            )}
          </DialogHeader>
          {previewItem?.html ? (
            <iframe
              title={t("Podgląd")}
              srcDoc={previewItem.html}
              sandbox="allow-same-origin"
              className="w-full h-[420px] rounded-md border border-border bg-white"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("To archiwum nie zawierało pliku HTML do podglądu.")}
            </p>
          )}
          {previewItem?.fileNames && previewItem.fileNames.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-md border p-2 space-y-1">
              {previewItem.fileNames.map((f) => (
                <div key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3 shrink-0" /> <span className="truncate">{f}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button size="sm" onClick={() => setPreviewItem(null)}>
              {t("Zamknij")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(o) => !o && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Usunąć tę pozycję?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("Tej operacji nie można cofnąć.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Anuluj")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t("Usuń")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
