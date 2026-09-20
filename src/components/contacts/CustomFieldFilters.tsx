import { Check, ChevronsUpDown, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/**
 * Filtry po polach dodanych przez klinikę (wiek, płeć, miasto…).
 *
 * **Pokazywane są tylko pola, w których faktycznie coś jest.** Pole zdefiniowane
 * w ustawieniach, ale nigdzie niewypełnione, dałoby filtr bez ani jednej opcji —
 * przycisk, który nic nie robi, wygląda jak usterka.
 *
 * **Lista z wyszukiwaniem, nie zwykły wybór.** „Miasto" potrafi mieć setki
 * wartości; rozwijana lista bez szukania jest przy takiej liczbie bezużyteczna,
 * a ucięcie jej do najczęstszych po cichu chowałoby część bazy przed filtrem.
 *
 * Wartości i liczniki liczy serwer z **całej bazy**, nie z bieżącej strony —
 * inaczej „Wrocław (312)" znaczyłoby „312 na tej stronie".
 */

interface FieldLike {
  key: string;
  label: string;
  builtin: boolean;
}

export function CustomFieldFilters({
  fields,
  values,
  selected,
  onChange,
}: {
  fields: FieldLike[];
  /** Wartości występujące w bazie: klucz pola → [wartość, ile razy]. */
  values: Record<string, [string, number][]>;
  selected: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const filterable = fields.filter((f) => !f.builtin && (values[f.key]?.length ?? 0) > 0);
  if (filterable.length === 0) return null;

  return (
    <>
      {filterable.map((field) => {
        const options = values[field.key] ?? [];
        const current = selected[field.key] ?? "";
        return (
          <Popover key={field.key}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("h-9 gap-1.5", current && "border-primary/40 bg-primary-soft")}
              >
                {field.label}
                {current ? <span className="font-medium">: {current}</span> : null}
                {current ? (
                  <X
                    className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                    onClick={(e) => {
                      // Czyszczenie bez otwierania listy — jedno kliknięcie
                      // zamiast otwórz→wybierz „wszystkie".
                      e.preventDefault();
                      e.stopPropagation();
                      const next = { ...selected };
                      delete next[field.key];
                      onChange(next);
                    }}
                  />
                ) : (
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <Command>
                <CommandInput
                  placeholder={t("Szukaj — {v0}…", { v0: field.label.toLowerCase() })}
                />
                <CommandList>
                  <CommandEmpty>{t("Brak wartości.")}</CommandEmpty>
                  <CommandGroup>
                    {options.map(([value, count]) => (
                      <CommandItem
                        key={value}
                        value={value}
                        onSelect={() => {
                          const next = { ...selected };
                          // Ponowne kliknięcie w wybraną wartość ją zdejmuje.
                          if (current === value) delete next[field.key];
                          else next[field.key] = value;
                          onChange(next);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            current === value ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="flex-1 truncate">{value}</span>
                        <span className="text-xs text-muted-foreground">{count}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        );
      })}
    </>
  );
}
