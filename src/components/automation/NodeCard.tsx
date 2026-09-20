import { MoreHorizontal, Pencil, Trash2, FlagTriangleRight, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { intlLocale, t } from "@/lib/i18n";

export function NodeCard({
  icon: Icon,
  kind,
  title,
  summary,
  tone,
  onClick,
  onDelete,
  deletable = true,
  contactCount,
}: {
  icon: LucideIcon;
  kind: string;
  title: string;
  summary?: string;
  tone: string;
  onClick?: () => void;
  onDelete?: () => void;
  deletable?: boolean;
  contactCount?: number;
}) {
  return (
    <div className="group relative w-[220px] rounded-xl bg-card border border-border shadow-sm hover:border-primary/40 hover:shadow-md transition-all">
      <button type="button" onClick={onClick} className="w-full text-left cursor-pointer">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <div className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", tone)}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-xs font-semibold text-foreground truncate">{kind}</span>
        </div>
        <div className="h-px bg-border/70 mx-3" />
        <div className="px-3 py-2.5">
          <div className="text-xs text-foreground/90 leading-snug line-clamp-2">{title}</div>
          {summary && (
            <div className="mt-1.5 rounded-md bg-muted/60 border border-border px-2 py-1 text-[11px] text-muted-foreground truncate">
              {summary}
            </div>
          )}
          {typeof contactCount === "number" && (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary">
              <Users className="h-3 w-3" /> {contactCount.toLocaleString(intlLocale())}{" "}
              {t(" kontaktów")}
            </div>
          )}
        </div>
      </button>

      {onClick && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onClick} className="gap-2">
              <Pencil className="h-3.5 w-3.5" /> {t(" Edytuj")}
            </DropdownMenuItem>
            {deletable && onDelete && (
              <DropdownMenuItem
                onClick={onDelete}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t(" Usuń krok")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export function EndCard({ onAdd, contactCount }: { onAdd: () => void; contactCount?: number }) {
  return (
    <div className="w-[220px] rounded-xl border border-dashed border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
          <FlagTriangleRight className="h-4 w-4" />
        </div>
        <span className="text-xs font-semibold text-muted-foreground">{t("Koniec ścieżki")}</span>
      </div>
      {typeof contactCount === "number" && (
        <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Users className="h-3 w-3" /> {contactCount.toLocaleString(intlLocale())}{" "}
          {t(" kontaktów")}
        </div>
      )}
      <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={onAdd}>
        {t("Dodaj krok")}
      </Button>
    </div>
  );
}

export function EdgeLine({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center shrink-0 w-[64px]">
      {label && (
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 whitespace-nowrap">
          {label}
        </span>
      )}
      <div
        className="h-px w-full"
        style={{
          backgroundImage: "linear-gradient(to right, oklch(0.78 0.02 240) 50%, transparent 0%)",
          backgroundSize: "6px 1px",
          backgroundRepeat: "repeat-x",
        }}
      />
    </div>
  );
}
