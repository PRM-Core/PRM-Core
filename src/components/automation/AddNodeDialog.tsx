import { Clock, Bot, Split, Shuffle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  conditionCatalog,
  actionCatalog,
  aiAgentCatalog,
  type CatalogItem,
} from "@/lib/automation-catalog";
import {
  nodeId,
  defaultPathBranches,
  defaultSplitVariants,
  type AutomationNode,
} from "@/lib/automation-flow";
import { t } from "@/lib/i18n";

function CatalogRow({ item, onClick }: { item: CatalogItem; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:border-primary/40 hover:bg-primary-soft/40 transition-colors cursor-pointer"
    >
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${item.tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{item.label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
      </div>
    </button>
  );
}

export function AddNodeDialog({
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

  const makeDelay = (): AutomationNode => ({
    id: nodeId("delay"),
    kind: "delay",
    amount: 1,
    unit: "days",
    position,
  });

  const makeCondition = (item: CatalogItem): AutomationNode => ({
    id: nodeId("condition"),
    kind: "condition",
    key: item.key,
    config: {},
    position,
  });

  const makeAction = (item: CatalogItem): AutomationNode => ({
    id: nodeId("action"),
    kind: "action",
    key: item.key,
    config: {},
    position,
  });

  const makePath = (): AutomationNode => ({
    id: nodeId("path"),
    kind: "path",
    branches: defaultPathBranches(),
    config: {},
    position,
  });

  const makeSplit = (): AutomationNode => ({
    id: nodeId("split"),
    kind: "split",
    variants: defaultSplitVariants(),
    config: {},
    position,
  });

  const makeAiAgent = (): AutomationNode => ({
    id: nodeId("aiAgent"),
    kind: "aiAgent",
    goal: "",
    paths: [
      { id: nodeId("path"), label: t("Ścieżka 1") },
      { id: nodeId("path"), label: t("Ścieżka 2") },
    ],
    position,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Dodaj krok scenariusza")}</DialogTitle>
          <DialogDescription>
            {t("Wybierz co ma się wydarzyć w tym miejscu ścieżki pacjenta.")}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="action">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="action">{t("Akcja")}</TabsTrigger>
            <TabsTrigger value="condition">{t("Warunek")}</TabsTrigger>
            <TabsTrigger value="branch">{t("Rozgałęzienie")}</TabsTrigger>
            <TabsTrigger value="delay">{t("Opóźnienie")}</TabsTrigger>
            <TabsTrigger value="ai">{t("Agent AI")}</TabsTrigger>
          </TabsList>

          <TabsContent value="action" className="mt-4 space-y-2 max-h-[45vh] overflow-y-auto pr-1">
            {actionCatalog.map((item) => (
              <CatalogRow key={item.key} item={item} onClick={() => pick(makeAction(item))} />
            ))}
          </TabsContent>

          <TabsContent
            value="condition"
            className="mt-4 space-y-2 max-h-[45vh] overflow-y-auto pr-1"
          >
            {conditionCatalog.map((item) => (
              <CatalogRow key={item.key} item={item} onClick={() => pick(makeCondition(item))} />
            ))}
          </TabsContent>

          <TabsContent value="branch" className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => pick(makePath())}
              className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:border-primary/40 hover:bg-primary-soft/40 transition-colors cursor-pointer"
            >
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-teal-100 text-teal-700">
                <Split className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("Rozgałęzienie (Path)")}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "Dzieli ścieżkę na dowolnie wiele odnóg. Każda ma własny filtr — kontakt schodzi pierwszą, której filtr spełnia.",
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => pick(makeSplit())}
              className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:border-primary/40 hover:bg-primary-soft/40 transition-colors cursor-pointer"
            >
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-700">
                <Shuffle className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("Split A/B")}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "Losowo dzieli kontakty między warianty wg zadanych procentów — do testów A/B.",
                  )}
                </div>
              </div>
            </button>
          </TabsContent>

          <TabsContent value="delay" className="mt-4">
            <button
              type="button"
              onClick={() => pick(makeDelay())}
              className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:border-primary/40 hover:bg-primary-soft/40 transition-colors cursor-pointer"
            >
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-amber-100 text-amber-700">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("Poczekaj")}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t("Wstrzymuje ścieżkę o określony czas przed kolejnym krokiem")}
                </div>
              </div>
            </button>
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <button
              type="button"
              onClick={() => pick(makeAiAgent())}
              className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:border-primary/40 hover:bg-primary-soft/40 transition-colors cursor-pointer"
            >
              <div
                className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${aiAgentCatalog.tone}`}
              >
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{aiAgentCatalog.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {aiAgentCatalog.description}
                </div>
              </div>
            </button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
