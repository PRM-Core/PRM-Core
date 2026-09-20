import { ArrowDown, ArrowUp, Columns3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { ColumnPrefs } from "@/lib/table-columns";
import { t } from "@/lib/i18n";

/**
 * Wybór i kolejność kolumn tabeli.
 *
 * **Strzałki, nie przeciąganie.** Przeciąganie wygląda lepiej, ale wymaga
 * biblioteki i nie działa z klawiatury ani z czytnikiem ekranu. Przy kilkunastu
 * kolumnach dwa kliknięcia w strzałkę są szybsze niż celowanie myszą, a lista
 * pozostaje dostępna dla każdego.
 *
 * Kolejność na liście jest kolejnością w tabeli — także dla kolumn ukrytych,
 * żeby po odkryciu kolumna wróciła tam, gdzie użytkownik ją ustawił, a nie na
 * koniec.
 */
export function ColumnPicker({ prefs }: { prefs: ColumnPrefs }) {
  const visibleCount = prefs.visible.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Columns3 className="h-4 w-4" />

          {t("Kolumny")}
          <span className="text-muted-foreground">({visibleCount})</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">{t("Kolumny i kolejność")}</span>
          {prefs.changed ? (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={prefs.reset}>
              <RotateCcw className="h-3.5 w-3.5" />

              {t("Domyślne")}
            </Button>
          ) : null}
        </div>
        <Separator />
        <div className="max-h-80 overflow-y-auto p-1">
          {prefs.ordered.map((col, i) => (
            <div
              key={col.key}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
            >
              <Checkbox
                id={`col-${col.key}`}
                checked={prefs.isVisible(col.key)}
                onCheckedChange={() => prefs.toggle(col.key)}
              />
              <label
                htmlFor={`col-${col.key}`}
                className="flex-1 cursor-pointer truncate text-sm"
                title={col.label}
              >
                {col.label}
              </label>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={i === 0}
                onClick={() => prefs.move(col.key, -1)}
                title={t("W górę")}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={i === prefs.ordered.length - 1}
                onClick={() => prefs.move(col.key, 1)}
                title={t("W dół")}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Separator />
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {t("Układ zapamiętywany w tej przeglądarce, osobno dla każdej listy.")}
        </p>
      </PopoverContent>
    </Popover>
  );
}
