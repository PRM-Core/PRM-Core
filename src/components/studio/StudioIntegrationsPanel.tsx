import { useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getCanvaStatus,
  getCanvaConnection,
  getCanvaDesigns,
  importCanvaDesign,
  type CanvaStatus,
} from "@/lib/api/canva.functions";
import { toast } from "sonner";
import { t as tr } from "@/lib/i18n";

/**
 * Sekcja „Integracje" w palecie bloków.
 *
 * **Pokazuje stan, którego nie udaje.** Canva wymaga OAuth i kluczy w `.env`;
 * dopóki ich nie ma, kafelek mówi wprost „niepodłączona" i wypisuje, czego
 * brakuje. Przycisk, który wygląda na działający i kończy się komunikatem
 * „wkrótce", jest gorszy niż jego brak — przy narzędziu, w którym placówka
 * podejmuje decyzje o wysyłce, każdy element interfejsu ma znaczyć to, co
 * pokazuje.
 */
interface CanvaDesignView {
  id: string;
  title: string;
  thumbnailUrl: string;
}

export function StudioIntegrationsPanel({
  onImported,
}: {
  /** Wywoływane po przeniesieniu projektu do Media — Studio otwiera wtedy agenta. */
  onImported?: (input: { mediaId: string; publicPath: string; name: string }) => void;
}) {
  const [canva, setCanva] = useState<CanvaStatus | null>(null);
  const [polaczone, setPolaczone] = useState<{ connected: boolean; accountName: string } | null>(
    null,
  );
  const [projekty, setProjekty] = useState<CanvaDesignView[] | null>(null);
  const [dalej, setDalej] = useState<string | null>(null);
  const [zajete, setZajete] = useState<string | null>(null);
  const [fraza, setFraza] = useState("");
  /**
   * **Cztery miniatury na start.** Paleta bloków
   * jest wąska; ściana projektów wypychałaby z niej wszystko inne, a i tak
   * szuka się konkretnego projektu po nazwie, nie wzrokiem po siatce.
   */
  const [widocznych, setWidocznych] = useState(8);

  const pobierzProjekty = async (continuation?: string, query?: string) => {
    setZajete("lista");
    try {
      const r = await getCanvaDesigns({ data: { continuation, query } });
      setProjekty((p) => [...(continuation ? (p ?? []) : []), ...r.designs]);
      setDalej(r.continuation);
      // Nowe wyszukanie zaczyna od czterech; doładowanie kolejnej strony nie
      // ma zwijać tego, co użytkownik już rozwinął.
      if (!continuation) setWidocznych(8);
    } catch (err) {
      toast.error(tr("Nie udało się pobrać projektów"), {
        description: err instanceof Error ? err.message : tr("Spróbuj ponownie."),
      });
    } finally {
      setZajete(null);
    }
  };

  /**
   * Szukanie z opóźnieniem: zapytanie leci **400 ms po ostatnim znaku**, a nie
   * po każdym. Bez tego wpisanie „ulotka" to siedem wywołań API Canvy, z których
   * sześć jest natychmiast nieaktualnych.
   */
  useEffect(() => {
    if (!polaczone?.connected) return;
    const t = setTimeout(() => void pobierzProjekty(undefined, fraza || undefined), 400);
    return () => clearTimeout(t);
  }, [fraza, polaczone?.connected]);

  const importuj = async (d: CanvaDesignView) => {
    setZajete(d.id);
    try {
      const r = await importCanvaDesign({ data: { designId: d.id, title: d.title } });
      toast.success(tr('Pobrano „{title}"', { title: d.title }), {
        description: tr("Projekt trafił do Media. PRM_Agent układa z niego klocki."),
      });
      onImported?.({ mediaId: r.mediaId, publicPath: r.publicPath, name: r.name });
    } catch (err) {
      toast.error(tr("Nie udało się pobrać projektu"), {
        description: err instanceof Error ? err.message : tr("Spróbuj ponownie."),
      });
    } finally {
      setZajete(null);
    }
  };

  useEffect(() => {
    getCanvaStatus()
      .then(setCanva)
      .catch(() =>
        setCanva({ configured: false, missing: ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET"] }),
      );
    getCanvaConnection()
      .then((c) => {
        // Samo ustawienie stanu — pierwsze pobranie robi efekt wyszukiwania
        // niżej (z pustą frazą). Wywołanie go także tutaj znaczyłoby dwa
        // zapytania do Canvy przy każdym wejściu w zakładkę.
        setPolaczone(c);
      })
      .catch(() => setPolaczone({ connected: false, accountName: "" }));
  }, []);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-border/60 bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{tr("Canva")}</span>
              {canva === null ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : canva.configured ? (
                <Badge variant="secondary" className="rounded-full text-[10px] font-normal">
                  {tr("podłączona")}
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-full text-[10px] font-normal">
                  {tr("niepodłączona")}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {tr(
                "Pobieranie gotowych projektów (newslettery, e-maile, pop-upy). Grafiki trafiają do biblioteki Media, a treść zostaje edytowalna — nie jako jeden obrazek.",
              )}
            </p>
          </div>
        </div>

        {canva !== null && !canva.configured && (
          <div className="mt-2 space-y-1.5 rounded-lg bg-muted/40 p-2">
            <p className="text-[11px] leading-snug">
              {tr("Instalacja nie ma jeszcze kluczy integracji. Brakuje:")}{" "}
              {canva.missing.map((m) => (
                <code key={m} className="mx-0.5 rounded bg-background px-1 py-0.5 text-[10px]">
                  {m}
                </code>
              ))}
            </p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {tr(
                "Klucze zakłada się w portalu deweloperskim Canvy i wpisuje w Integracje → Klucze i dane dostępowe.",
              )}
            </p>
            <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]">
              <a href="https://www.canva.com/developers/" target="_blank" rel="noreferrer noopener">
                {tr("Portal deweloperski Canvy ")} <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
        )}

        {canva?.configured && polaczone && !polaczone.connected && (
          <div className="mt-2 space-y-1.5 rounded-lg bg-muted/40 p-2">
            <p className="text-[11px] leading-snug">
              {tr("Klucze są na miejscu, ale konto Canvy nie jest jeszcze zalogowane.")}
            </p>
            <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]">
              <a href="/integrations">
                {tr("Połącz w Integracjach ")} <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
        )}

        {polaczone?.connected && (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              {tr("Konto")}
              {polaczone.accountName ? ` ${polaczone.accountName}` : ""}{" "}
              {tr(" · kliknięcie w projekt pobiera go i przekazuje PRM_Agentowi.")}
            </p>

            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={fraza}
                  onChange={(e) => setFraza(e.target.value)}
                  placeholder={tr("Szukaj projektu…")}
                  className="h-7 pl-7 text-[11px]"
                />
              </div>
              {/* Odświeżenie na żądanie. Lista pobiera się przy wejściu
                  w zakładkę, a projekt utworzony w Canvie minutę temu nie ma
                  jak się w niej pojawić sam — bez tego przycisku trzeba było
                  przełączać zakładki i zgadywać, czy to już. */}
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 shrink-0"
                title={tr("Pobierz listę projektów od nowa")}
                disabled={zajete === "lista"}
                onClick={() => void pobierzProjekty(undefined, fraza || undefined)}
              >
                <RefreshCw className={`h-3 w-3 ${zajete === "lista" ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {projekty === null ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> {tr(" Pobieram listę projektów…")}
              </div>
            ) : projekty.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {fraza
                  ? tr('Nic nie pasuje do „{fraza}".', { fraza: fraza })
                  : tr("Na tym koncie nie ma jeszcze żadnego projektu.")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {projekty.slice(0, widocznych).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    disabled={!!zajete}
                    onClick={() => void importuj(d)}
                    className="group rounded-lg border border-border/60 p-1.5 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
                    title={d.title}
                  >
                    {d.thumbnailUrl ? (
                      <img
                        src={d.thumbnailUrl}
                        alt=""
                        className="mb-1 aspect-[4/3] w-full rounded object-cover"
                      />
                    ) : (
                      <div className="mb-1 aspect-[4/3] w-full rounded bg-muted" />
                    )}
                    <div className="truncate text-[11px]">
                      {zajete === d.id ? tr("Pobieram…") : d.title}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Jeden przycisk, dwa zadania: najpierw pokazuje kolejne cztery
                z już pobranych, a gdy te się skończą — dobiera następną stronę
                z Canvy. Dla człowieka to ta sama czynność, więc nie ma powodu
                rozdzielać jej na dwa przyciski. */}
            {projekty && projekty.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {tr("Pokazano ")} {Math.min(widocznych, projekty.length)} {tr(" z ")}{" "}
                {projekty.length}
                {dalej ? tr(" · w Canvie jest ich jeszcze więcej") : tr(" (to wszystko z Canvy)")}
              </p>
            )}

            {projekty && (widocznych < projekty.length || dalej) && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-full text-[11px]"
                disabled={zajete === "lista"}
                onClick={() => {
                  if (widocznych < projekty.length) setWidocznych(widocznych + 8);
                  else void pobierzProjekty(dalej ?? undefined, fraza || undefined);
                }}
              >
                {zajete === "lista" ? tr("Pobieram…") : tr("Pokaż więcej")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
