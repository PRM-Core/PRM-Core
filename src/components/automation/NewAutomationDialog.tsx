import { Workflow, Bot, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { t } from "@/lib/i18n";

export function NewAutomationDialog({
  open,
  onOpenChange,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (mode: "builder" | "ai") => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Nowa automatyzacja")}</DialogTitle>
          <DialogDescription>
            {t("Wybierz, jak chcesz zbudować scenariusz komunikacji z pacjentem.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <button
            type="button"
            onClick={() => onChoose("builder")}
            className="group flex flex-col items-start gap-3 rounded-xl border border-border p-4 text-left hover:border-primary/40 hover:bg-primary-soft/40 transition-colors cursor-pointer"
          >
            <div className="h-10 w-10 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
              <Workflow className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold flex items-center gap-1">
                {t("Wizualny builder")}
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("Zbuduj scenariusz krok po kroku — wyzwalacz, warunki i akcje na płótnie.")}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChoose("ai")}
            className="group flex flex-col items-start gap-3 rounded-xl border border-border p-4 text-left hover:border-primary/40 hover:bg-primary-soft/40 transition-colors cursor-pointer"
          >
            <div className="h-10 w-10 rounded-xl bg-fuchsia-100 flex items-center justify-center text-fuchsia-700">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold flex items-center gap-1">
                {t("Agent AI")}
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("Opisz cel słowami, a agent przygotuje gotowy scenariusz za Ciebie.")}
              </p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
