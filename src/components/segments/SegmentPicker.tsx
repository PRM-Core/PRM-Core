import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getSegmentOptions, type SegmentOption } from "@/lib/api/segments.functions";
import { t } from "@/lib/i18n";

/**
 * Wybór segmentów dla kontaktu — wyłącznie tych, które moduł Segmenty naprawdę
 * ma.
 *
 * To pole było wolnym tekstem, czyli sposobem, w jaki baza dorabia się „VIP",
 * „vip " i „V.I.P.", które dla człowieka są jednym, a dla automatyzacji trzema
 * różnymi rzeczami. Wpisywania już nie ma: segment musi istnieć, zanim ktokolwiek
 * do niego trafi.
 *
 * Etykiety, które kontakt już nosi, a moduł ich nie zna, są nadal pokazywane i
 * nadal da się je zdjąć — ciche wyrzucenie ich przy pierwszej edycji skasowałoby
 * przypisanie, o którego skasowanie nikt nie prosił. W praktyce moduł przejmuje
 * zabłąkane etykiety przy odczycie, więc dotyczy to tylko takiej, która zniknęła
 * w trakcie edycji.
 */
export function SegmentPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [options, setOptions] = useState<SegmentOption[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getSegmentOptions()
      .then((rows) => alive && setOptions(rows))
      .catch(() => alive && setOptions([]));
    return () => {
      alive = false;
    };
  }, []);

  const known = useMemo(() => new Set((options ?? []).map((o) => o.name.toLowerCase())), [options]);
  const selected = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value]);

  const toggle = (name: string) => {
    onChange(
      selected.has(name.toLowerCase())
        ? value.filter((v) => v.toLowerCase() !== name.toLowerCase())
        : [...value, name],
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 && (
          <span className="text-sm text-muted-foreground">{t("Brak przypisanych segmentów")}</span>
        )}
        {value.map((name) => {
          const orphan = options !== null && !known.has(name.toLowerCase());
          return (
            <Badge
              key={name}
              className={
                orphan
                  ? "gap-1 rounded-full px-2.5 font-medium bg-[oklch(0.78_0.15_75)]/15 text-[oklch(0.38_0.1_75)] dark:text-[oklch(0.85_0.1_75)] hover:bg-[oklch(0.78_0.15_75)]/25"
                  : "gap-1 rounded-full px-2.5 font-medium bg-primary text-primary-foreground hover:bg-primary/90"
              }
              title={
                orphan
                  ? t("Ta etykieta nie ma odpowiednika w module Segmenty — można ją tylko usunąć.")
                  : undefined
              }
            >
              {orphan && <TriangleAlert className="h-3 w-3" />}
              {name}
              <button
                type="button"
                onClick={() => toggle(name)}
                className="ml-0.5 rounded-full opacity-70 hover:opacity-100"
                aria-label={t("Usuń segment {name}", { name: name })}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={options === null}>
            <Plus className="h-3.5 w-3.5" />
            {options === null ? t("Wczytywanie segmentów…") : t("Wybierz segment")}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("Szukaj segmentu…")} />
            <CommandList>
              <CommandEmpty>
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  {t("Nie ma takiego segmentu. Segmenty tworzy się w module")}{" "}
                  <Link to="/segments" className="text-primary underline underline-offset-2">
                    {t("Segmenty")}
                  </Link>
                  .
                </div>
              </CommandEmpty>
              <CommandGroup>
                {(options ?? []).map((option) => {
                  // Do segmentu z warunkami nie da się nikogo „przypisać" — w nim
                  // się jest albo nie, a rozstrzyga o tym definicja przy każdym
                  // odczycie. Kliknięcie dodałoby etykietę o tej samej nazwie,
                  // która nie poszerzyłaby tamtego audytorium ani o jedną osobę:
                  // wyglądałoby na przypisanie i nim nie było.
                  const computed = !option.fromLabel;
                  return (
                    <CommandItem
                      key={option.id}
                      value={option.name}
                      disabled={computed && !selected.has(option.name.toLowerCase())}
                      onSelect={() => {
                        if (computed && !selected.has(option.name.toLowerCase())) return;
                        toggle(option.name);
                      }}
                      className={computed ? "opacity-60" : undefined}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${
                          selected.has(option.name.toLowerCase()) ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <span className="flex-1 truncate">{option.name}</span>
                      {computed ? (
                        <span
                          className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground"
                          title={t(
                            "Segment z warunkami — przynależność liczy się automatycznie z danych pacjenta, nie nadaje się jej ręcznie.",
                          )}
                        >
                          {t("automatyczny")}
                        </span>
                      ) : (
                        option.status === "draft" && (
                          <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("szkic")}
                          </span>
                        )
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <p className="text-xs text-muted-foreground">
        {t("Można wybrać wyłącznie segmenty istniejące w module")}{" "}
        <Link to="/segments" className="text-primary underline underline-offset-2">
          {t("Segmenty")}
        </Link>
        {t(
          ". Segmenty oznaczone „automatyczny” mają warunki — pacjent wchodzi do nich sam, gdy zacznie je spełniać.",
        )}
      </p>
    </div>
  );
}
