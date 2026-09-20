import { useEffect, useState } from "react";
import {
  AppWindow,
  Code2,
  FileArchive,
  Layers,
  Loader2,
  Mail,
  Newspaper,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getContentItems } from "@/lib/api/content-items.functions";
import { KIND_LABELS, type BuilderKind, type ContentItem } from "@/lib/content-builder";
import { count } from "@/lib/plural";
import { t } from "@/lib/i18n";

/**
 * Ekran główny Studia — wszystkie projekty w jednym miejscu.
 *
 * **Trzy moduły, jedna lista.** Newsletter, e-mail i pop-up to osobne sekcje
 * narzędzia, bo osobno się je wysyła — ale przy projektowaniu pytanie brzmi
 * „nad czym ostatnio pracowałem", a nie „w którym module to leżało". Dotąd
 * wejście w Studio z paska bocznego trafiało na pustą listę e-maili i kończyło
 * się odesłaniem do modułu.
 *
 * Lista czyta te same `content_items`, co moduły — **to nie jest osobny
 * rejestr projektów**, tylko inny widok na te same wiadomości.
 */

const KINDS: BuilderKind[] = ["newsletter", "email", "popup"];

const ICON: Record<string, typeof Mail> = {
  newsletter: Newspaper,
  email: Mail,
  popup: AppWindow,
};

interface Row extends ContentItem {
  kindKey: BuilderKind;
}

export function StudioHome({ onOpen }: { onOpen: (kind: BuilderKind, id: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<BuilderKind | "all">("all");

  useEffect(() => {
    Promise.all(
      KINDS.map((k) =>
        getContentItems({ data: { kind: k as never } })
          .then((items) => items.map((i) => ({ ...i, kindKey: k })))
          // Awaria jednego modułu nie może wygasić całej listy — pozostałe
          // wciąż mają się pokazać.
          .catch(() => [] as Row[]),
      ),
    )
      .then((lists) => setRows(lists.flat()))
      .catch(() => setRows([]));
  }, []);

  if (rows === null) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = rows
    .filter((r) => (only === "all" ? true : r.kindKey === only))
    .filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Szukaj projektu…")}
            className="h-9 pl-8"
          />
        </div>
        <div className="flex items-center rounded-lg border border-border/60 p-0.5">
          {(["all", ...KINDS] as const).map((k) => (
            <Button
              key={k}
              variant={only === k ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setOnly(k)}
            >
              {k === "all" ? t("Wszystkie") : KIND_LABELS[k].title}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {count(filtered.length, "projekt", "projekty", "projektów")}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-20 text-center">
          <Layers className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">
            {rows.length === 0 ? t("Nie ma jeszcze żadnego projektu") : t("Nic nie pasuje")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {rows.length === 0
              ? t("Projekty zakłada się w module kanału — Newsletter, E-mail albo Pop-Up.")
              : t("Zmień frazę albo filtr kanału.")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => {
            const Icon = ICON[r.kindKey] ?? Mail;
            const blocks = r.blocks?.length ?? 0;
            return (
              <button
                key={`${r.kindKey}-${r.id}`}
                onClick={() => onOpen(r.kindKey, r.id)}
                className="group flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <Badge
                    variant={r.status === "ready" ? "secondary" : "outline"}
                    className="font-normal text-[10px]"
                  >
                    {r.status === "ready" ? "gotowy" : t("wersja robocza")}
                  </Badge>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>{KIND_LABELS[r.kindKey].title}</span>
                    <span>·</span>
                    {/* Treść bez bloków ma być rozpoznawalna z listy: otworzy
                        się w edytorze kodu, nie na płótnie. */}
                    {r.source === "blocks" ? (
                      <span>{count(blocks, "blok", "bloki", "bloków")}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        {r.source === "zip" ? (
                          <FileArchive className="h-3 w-3" />
                        ) : (
                          <Code2 className="h-3 w-3" />
                        )}
                        {r.source === "zip" ? t("archiwum ZIP") : t("własny HTML")}
                      </span>
                    )}
                    {r.updatedAt && (
                      <>
                        <span>·</span>
                        <span>{r.updatedAt}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
