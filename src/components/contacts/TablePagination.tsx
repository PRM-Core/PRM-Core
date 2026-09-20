import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZES } from "@/lib/table-columns";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Pasek stronicowania listy — wspólny dla Kontaktów i Kontaktów telefonicznych.
 *
 * Wyodrębniony przy dokładaniu stronicowania do drugiego modułu: skopiowany
 * rozjechałby się przy pierwszej poprawce, a to jest element, w którym pomyłka
 * o jeden (ostatnia strona, pusty wynik) jest łatwa i niewidoczna.
 *
 * „Na stronę" siedzi po lewej, przy liczbie wyników, bo to jest odpowiedź na
 * pytanie „ile tego jest", a nie nawigacja.
 */

export function TablePagination({
  page,
  pageSize,
  total,
  loading,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  onPage: (updater: (prev: number) => number) => void;
  onPageSize: (size: number) => void;
}) {
  // Co najmniej jedna strona, także przy pustym wyniku — „1 / 0" wygląda
  // jak usterka, a przyciski i tak są wtedy wyłączone.
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
      <div className="flex items-center gap-3">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size.toLocaleString(intlLocale())} {t(" / stronę")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {total === 0
            ? t("Brak wyników")
            : t("{v0}–{v1} z {v2}", {
                v0: (page * pageSize + 1).toLocaleString(intlLocale()),
                v1: Math.min((page + 1) * pageSize, total).toLocaleString(intlLocale()),
                v2: total.toLocaleString(intlLocale()),
              })}
          {loading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0 || loading}
          onClick={() => onPage(() => 0)}
        >
          «
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0 || loading}
          onClick={() => onPage((p) => Math.max(0, p - 1))}
        >
          {t("Poprzednia")}
        </Button>
        <span className="px-2 text-xs tabular-nums text-muted-foreground">
          {page + 1} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page + 1 >= pageCount || loading}
          onClick={() => onPage((p) => p + 1)}
        >
          {t("Następna")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page + 1 >= pageCount || loading}
          onClick={() => onPage(() => pageCount - 1)}
        >
          »
        </Button>
      </div>
    </div>
  );
}
