import { useEffect, useRef, useState } from "react";
import { plainTextToHtml, sanitizePastedHtml } from "@/lib/paste-html";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Link2,
  Wand2,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PERSONALIZATION_FIELDS,
  mergeTagHtml,
  FONT_FAMILIES,
  FONT_SIZES,
} from "@/lib/content-builder";
import { t } from "@/lib/i18n";

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * A small Mautic-style rich-text toolbar over a contentEditable region.
 * Uses document.execCommand for structural formatting (bold/italic/lists/
 * links/alignment) and manual Range wrapping for typography (font family/
 * size/color) since execCommand's legacy <font> output isn't reliable for
 * email HTML — an inline-styled <span> is.
 */
export function RichTextEditor({
  value,
  onChange,
  minHeight = 110,
  toolbar = true,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
  /**
   * Pasek narzędzi. Wyłączany przy edycji **na płótnie**: tam liczy się miejsce,
   * a dwa identyczne paski — jeden na podglądzie, drugi w panelu po prawej —
   * to ta sama decyzja pokazana dwa razy. Na płótnie się pisze i wkleja,
   * formatowanie zostaje w panelu.
   */
  toolbar?: boolean;
  className?: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastRangeRef = useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  // Only hydrate from `value` when it actually changed from outside (initial
  // mount, block switch, undo, etc.) — never on every render, or the caret
  // would jump to the start on each keystroke since onInput round-trips
  // through `value`. `lastEmittedRef` starts at `null` (not `value`) so the
  // very first render always hydrates too.
  const lastEmittedRef = useRef<string | null>(null);
  useEffect(() => {
    const el = editorRef.current;
    if (el && value !== lastEmittedRef.current) {
      el.innerHTML = value || "";
      lastEmittedRef.current = value;
    }
  }, [value]);

  useEffect(() => {
    const captureSelection = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
        lastRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener("selectionchange", captureSelection);
    return () => document.removeEventListener("selectionchange", captureSelection);
  }, []);

  /**
   * Wklejanie przez własną obsługę, nie przez domyślną przeglądarki.
   *
   * Domyślne wklejenie wkłada do `contentEditable` **wszystko**, co Word włożył
   * do schowka — łącznie z arkuszem stylów dokumentu i tabelami układu. Po nim
   * treści nie dało się już formatować. Czyścimy więc HTML sami i wstawiamy
   * wynik; sam tekst przechodzi bez zmian, co do znaku.
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    if (!html && !text) return;
    e.preventDefault();
    const cleaned = html ? sanitizePastedHtml(html) : plainTextToHtml(text);
    document.execCommand("insertHTML", false, cleaned);
    emitChange();
  };

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    lastEmittedRef.current = el.innerHTML;
    onChange(el.innerHTML);
  };

  const focusAndRestoreSelection = (): Selection | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    editor.focus();
    const sel = window.getSelection();
    if (sel && lastRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(lastRangeRef.current);
    }
    return sel;
  };

  const exec = (command: string, arg?: string) => {
    focusAndRestoreSelection();
    document.execCommand(command, false, arg);
    const sel = window.getSelection();
    if (sel && sel.rangeCount) lastRangeRef.current = sel.getRangeAt(0).cloneRange();
    emitChange();
  };

  const wrapSelectionWithStyle = (prop: "fontFamily" | "fontSize" | "color", cssValue: string) => {
    const range = lastRangeRef.current;
    if (!range || range.collapsed) return;
    const sel = focusAndRestoreSelection();
    const span = document.createElement("span");
    span.style.setProperty(
      prop === "fontFamily" ? "font-family" : prop === "fontSize" ? "font-size" : "color",
      cssValue,
    );
    try {
      range.surroundContents(span);
    } catch {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    if (sel) {
      const next = document.createRange();
      next.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(next);
      lastRangeRef.current = next.cloneRange();
    }
    emitChange();
  };

  const insertHtmlAtCaret = (html: string) => {
    focusAndRestoreSelection();
    document.execCommand("insertHTML", false, `${html}&nbsp;`);
    emitChange();
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    exec("createLink", url);
    setLinkOpen(false);
    setLinkUrl("");
  };

  const groups = [...new Set(PERSONALIZATION_FIELDS.map((f) => f.group))];

  return (
    <div className="space-y-1.5">
      <div
        className="flex flex-wrap items-center gap-1 rounded-md border border-input bg-muted/30 p-1"
        hidden={!toolbar}
      >
        <Select onValueChange={(v) => wrapSelectionWithStyle("fontFamily", v)}>
          <SelectTrigger className="h-7 w-[92px] text-[11px]">
            <SelectValue placeholder={t("Czcionka")} />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((f) => (
              <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={(v) => wrapSelectionWithStyle("fontSize", `${v}px`)}>
          <SelectTrigger className="h-7 w-[62px] text-[11px]">
            <SelectValue placeholder={t("Rozm.")} />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
                {t("px")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="color"
          defaultValue="#111827"
          className="h-7 w-7 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
          title={t("Kolor tekstu")}
          onMouseDown={() => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
              lastRangeRef.current = sel.getRangeAt(0).cloneRange();
            }
          }}
          onChange={(e) => wrapSelectionWithStyle("color", e.target.value)}
        />
        <Separator orientation="vertical" className="h-5" />
        <ToolbarButton label={t("Pogrubienie")} onClick={() => exec("bold")}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t("Kursywa")} onClick={() => exec("italic")}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t("Podkreślenie")} onClick={() => exec("underline")}>
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t("Przekreślenie")} onClick={() => exec("strikeThrough")}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <Separator orientation="vertical" className="h-5" />
        <ToolbarButton label={t("Do lewej")} onClick={() => exec("justifyLeft")}>
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t("Wyśrodkuj")} onClick={() => exec("justifyCenter")}>
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t("Do prawej")} onClick={() => exec("justifyRight")}>
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t("Wyjustuj")} onClick={() => exec("justifyFull")}>
          <AlignJustify className="h-3.5 w-3.5" />
        </ToolbarButton>
        <Separator orientation="vertical" className="h-5" />
        <ToolbarButton label={t("Lista punktowana")} onClick={() => exec("insertUnorderedList")}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t("Lista numerowana")} onClick={() => exec("insertOrderedList")}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={t("Wstaw link")}
              aria-label={t("Wstaw link")}
              onMouseDown={(e) => {
                e.preventDefault();
                focusAndRestoreSelection();
              }}
            >
              <Link2 className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-2" align="start">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && applyLink()}
            />
            <div className="flex justify-end gap-1.5">
              <Button type="button" size="sm" variant="outline" onClick={() => exec("unlink")}>
                {t("Usuń link")}
              </Button>
              <Button type="button" size="sm" onClick={applyLink}>
                {t("Wstaw")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <Separator orientation="vertical" className="h-5" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={t("Wstaw dane z karty kontaktu")}
              aria-label={t("Wstaw dane z karty kontaktu")}
              onMouseDown={(e) => e.preventDefault()}
            >
              <Wand2 className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            {groups.map((group) => (
              <div key={group}>
                <DropdownMenuLabel className="text-[11px]">{group}</DropdownMenuLabel>
                {PERSONALIZATION_FIELDS.filter((f) => f.group === group).map((f) => (
                  <DropdownMenuItem
                    key={f.value}
                    onSelect={() => insertHtmlAtCaret(mergeTagHtml(f.value))}
                  >
                    {f.label}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <ToolbarButton
          label={t("Wstaw skrót wypisania z bazy mailingowej")}
          onClick={() => insertHtmlAtCaret(mergeTagHtml("unsubscribeLink"))}
        >
          <LogOut className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className={
          className ??
          "rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_p]:m-0"
        }
        style={{ minHeight }}
        onInput={emitChange}
        onBlur={emitChange}
        onPaste={handlePaste}
      />
    </div>
  );
}
