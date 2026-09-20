import { useEffect, useState } from "react";
import { Code2, Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { ContentItem } from "@/lib/content-builder";
import { count } from "@/lib/plural";
import { t } from "@/lib/i18n";

/**
 * Edytor kodu dla treści, która nie ma klocków.
 *
 * **Po co to istnieje.** Wiadomość wgrana z archiwum ZIP albo wklejona jako
 * gotowy kod nie ma bloków — ma jeden kawał HTML-a przygotowany na zewnątrz.
 * Dotąd Studio pokazywało dla niej puste płótno, czyli sugerowało, że treści
 * nie ma, a poprawienie literówki w takim szablonie wymagało wgrania archiwum
 * od nowa.
 *
 * **Rozbicie tego HTML-a na bloki byłoby gorsze niż brak edycji.** Szablon
 * z ZIP-a to zwykle tabela w tabeli z inline'owymi stylami pod konkretny klient
 * pocztowy; „zamiana na klocki" oznaczałaby zgadywanie, co autor miał na myśli,
 * i cichą utratę tego, czego nie umiemy odwzorować. Kod zostaje kodem.
 *
 * Podgląd idzie przez `srcDoc` w ramce, **bez `allow-scripts`** — szablon jest
 * plikiem z zewnątrz i nie ma powodu wykonywać jego skryptów w sesji recepcji.
 */
export function StudioHtmlEditor({
  item,
  onChange,
}: {
  item: ContentItem;
  onChange: (html: string) => void;
}) {
  const [draft, setDraft] = useState(item.html ?? "");
  const [view, setView] = useState<"code" | "preview">("code");

  // Przełączenie wiadomości ma wczytać jej kod, a nie zostawić poprzedni.
  useEffect(() => {
    setDraft(item.html ?? "");
  }, [item.id, item.html]);

  const dirty = draft !== (item.html ?? "");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 font-normal">
            <Code2 className="h-3 w-3" />
            {item.source === "zip" ? t("Z archiwum ZIP") : t("Własny kod HTML")}
          </Badge>
          {item.fileNames && item.fileNames.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {count(item.fileNames.length, "plik", "pliki", "plików")} {t(" w archiwum")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg border border-border/60 p-0.5">
            <Button
              variant={view === "code" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setView("code")}
            >
              <Code2 className="h-3.5 w-3.5" /> {t(" Kod")}
            </Button>
            <Button
              variant={view === "preview" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setView("preview")}
            >
              <Eye className="h-3.5 w-3.5" /> {t(" Podgląd")}
            </Button>
          </div>
          {dirty && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setDraft(item.html ?? "")}
              >
                <RotateCcw className="h-3.5 w-3.5" /> {t(" Cofnij")}
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => onChange(draft)}>
                {t("Zastosuj")}
              </Button>
            </>
          )}
        </div>
      </div>

      {view === "code" ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="h-[58vh] resize-none font-mono text-xs leading-relaxed"
          placeholder="<html>…</html>"
        />
      ) : (
        <iframe
          // Bez `allow-scripts`: to plik z zewnątrz, a podgląd ma go pokazać,
          // nie uruchomić.
          sandbox=""
          srcDoc={draft}
          title={t("Podgląd treści")}
          className="h-[58vh] w-full rounded-lg border border-border/60 bg-white"
        />
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t("Ta treść nie ma bloków — to gotowy kod przygotowany poza narzędziem.")}{" "}
        <b>{t('Zmiany wchodzą po „Zastosuj"')}</b>
        {t(
          ', a do bazy dopiero po „Zapisz" na górnym pasku. Obrazy z archiwum leżą w bibliotece Media i odwołują się do nich adresy w kodzie.',
        )}
      </p>
    </div>
  );
}
