import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { triggerCatalog } from "@/lib/automation-catalog";
import { nodeId, type AutomationNode } from "@/lib/automation-flow";
import { t } from "@/lib/i18n";

export function AddTriggerDialog({
  open,
  onOpenChange,
  position,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: { x: number; y: number };
  onSelect: (node: AutomationNode) => void;
}) {
  const pick = (node: AutomationNode) => {
    onSelect(node);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Dodaj Trigger")}</DialogTitle>
          <DialogDescription>
            {t(
              "Wybierz zdarzenie, które uruchomi tę automatyzację. Każdy scenariusz musi się od niego zaczynać.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {triggerCatalog.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() =>
                  pick({
                    id: nodeId("trigger"),
                    kind: "trigger",
                    key: item.key,
                    config: {},
                    position,
                  })
                }
                className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:border-primary/40 hover:bg-primary-soft/40 transition-colors cursor-pointer"
              >
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${item.tone}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
