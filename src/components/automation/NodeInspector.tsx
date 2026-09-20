import { useEffect, useState } from "react";
import { Plus, Trash2, AlertTriangle, Info } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  triggerCatalog,
  conditionCatalog,
  actionCatalog,
  findCatalogItem,
  type CatalogField,
} from "@/lib/automation-catalog";
import {
  nodeId,
  makeBranchId,
  type AutomationNode,
  type PathBranchDef,
} from "@/lib/automation-flow";
import { getContentItemNames } from "@/lib/api/content-items.functions";
import type { BuilderKind } from "@/lib/content-builder";
import { KIND_LABELS } from "@/lib/content-builder";
import { getAllFunnels } from "@/lib/api/funnels.functions";
import { getSmsSenders, type SmsSenderView } from "@/lib/api/sms.functions";
import { getContactFields, type ContactFieldDef } from "@/lib/api/contact-fields.functions";

/** Radix forbids an empty item value, so "use the default" needs a sentinel. */
const DEFAULT_SENDER = "__default__";
import type { Funnel } from "@/lib/funnels";
import { t as tr, localized } from "@/lib/i18n";

/**
 * How much the PRM_Agent may change on a contact beyond picking a path.
 * Everything is off unless the user turns it on — an agent that can silently
 * invent segments across every automation is not a default anyone asked for.
 */
const AGENT_PERMISSIONS = localized(() => [
  {
    key: "canAddTags",
    label: tr("Może dodawać tagi"),
    hint: tr("np. oznaczyć zainteresowanie tematem"),
  },
  {
    key: "canRemoveTags",
    label: tr("Może usuwać tagi"),
    hint: tr("gdy tag się zdezaktualizował, np. pacjent przestał być leadem"),
  },
  {
    key: "canAssignSegments",
    label: tr("Może przypisywać do segmentów"),
    hint: tr("tylko do segmentów istniejących w module Segmenty — inną nazwę system odrzuci"),
  },
  {
    key: "canCreateSegments",
    label: tr("Może tworzyć nowe segmenty"),
    hint: tr("gdy dostrzeże powtarzalny wzorzec; nowy segment pojawia się w module Segmenty"),
  },
  {
    key: "canWriteMessages",
    label: tr("Może samodzielnie napisać do pacjenta"),
    hint: tr("sam układa treść i wysyła ją e-mailem lub SMS-em"),
  },
]);

/** What the agent may draw on when it writes. Only shown once messaging is on. */
const KNOWLEDGE_SCOPES = localized(() => [
  {
    value: "internal",
    label: tr("Tylko przypisane zasoby"),
    hint: tr("wyłącznie baza wiedzy z Ustawienia → PRM_Agent"),
  },
  {
    value: "web",
    label: tr("Także informacje z sieci"),
    hint: tr("agent może doszukać w internecie; wiedza placówki ma pierwszeństwo"),
  },
]);

/**
 * Says out loud when PRM Engine cannot actually run the selected step, so
 * nobody activates an automation and then waits for something that will never
 * happen. Driven by `engineNote` in the catalog.
 */
function EngineNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning-foreground mt-0.5" />
      <p className="text-xs text-warning-foreground leading-relaxed">{note}</p>
    </div>
  );
}

/**
 * Explains how a step that DOES work behaves — queue timing, expiry. Neutral
 * colours on purpose: the amber warning above means "this does nothing", and
 * reusing it here would make a working step look broken.
 */
function EngineHint({ hint }: { hint?: string }) {
  if (!hint) return null;
  return (
    <div className="flex gap-2 rounded-lg border border-border bg-muted/50 p-3">
      <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
      <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
    </div>
  );
}

/**
 * One Path branch: its label, how its filters combine, and the filters
 * themselves. A filter is just a catalog condition, so the engine evaluates it
 * with exactly the same code as a standalone condition node.
 */
function BranchEditor({
  branch,
  index,
  removable,
  onChange,
  onRemove,
}: {
  branch: PathBranchDef;
  index: number;
  removable: boolean;
  onChange: (branch: PathBranchDef) => void;
  onRemove: () => void;
}) {
  const filters = branch.filters ?? [];

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground shrink-0">{index + 1}.</span>
        <Input
          value={branch.label}
          onChange={(e) => onChange({ ...branch, label: e.target.value })}
          placeholder={tr("Nazwa odnogi")}
        />
        {removable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive shrink-0"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {filters.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {tr("Bez filtra — tą odnogą pójdzie każdy, kto nie pasował do wcześniejszych.")}
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Label className="text-[11px] text-muted-foreground">{tr("Musi spełnić")}</Label>
          <Select
            value={branch.match ?? "all"}
            onValueChange={(v) => onChange({ ...branch, match: v as "all" | "any" })}
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("wszystkie warunki")}</SelectItem>
              <SelectItem value="any">{tr("dowolny warunek")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {filters.map((filter, idx) => (
        <div key={idx} className="rounded-md border border-border/70 bg-muted/30 p-2 space-y-2">
          <div className="flex items-center gap-2">
            <Select
              value={filter.key}
              onValueChange={(key) => {
                const next = [...filters];
                next[idx] = { key, config: {} };
                onChange({ ...branch, filters: next });
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder={tr("Wybierz warunek…")} />
              </SelectTrigger>
              <SelectContent>
                {conditionCatalog.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive shrink-0"
              onClick={() => onChange({ ...branch, filters: filters.filter((_, i) => i !== idx) })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ConfigFields
            fields={findCatalogItem("condition", filter.key)?.fields ?? []}
            config={filter.config ?? {}}
            onChange={(config) => {
              const next = [...filters];
              next[idx] = { ...filter, config };
              onChange({ ...branch, filters: next });
            }}
          />
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() =>
          onChange({
            ...branch,
            match: branch.match ?? "all",
            filters: [...filters, { key: conditionCatalog[0].key, config: {} }],
          })
        }
      >
        <Plus className="h-3.5 w-3.5" /> {tr(" Dodaj warunek")}
      </Button>
    </div>
  );
}

function ConfigFields({
  fields,
  config,
  onChange,
}: {
  fields: CatalogField[];
  config: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const needsFunnels = fields.some((f) => f.type === "funnel" || f.type === "funnel-stage");
  const [funnels, setFunnels] = useState<Funnel[] | null>(null);
  useEffect(() => {
    if (needsFunnels) getAllFunnels().then(setFunnels);
  }, [needsFunnels]);

  const needsSenders = fields.some((f) => f.type === "sms-sender");
  const [senders, setSenders] = useState<SmsSenderView[] | null>(null);
  useEffect(() => {
    if (needsSenders) getSmsSenders().then(setSenders);
  }, [needsSenders]);

  // Szablony treści z BAZY, nie z `localStorage` — inaczej lista pokazywałaby
  // wyłącznie to, co utworzono w tej jednej przeglądarce, a węzeł wskazywałby
  // na szablon, którego serwer nie zna.
  const templateKinds = [
    ...new Set(
      fields
        .filter((f) => f.type === "content-template" && f.templateKind)
        .map((f) => f.templateKind as BuilderKind),
    ),
  ];
  const [templateOptions, setTemplateOptions] = useState<Record<string, string[]>>({});
  const templateKindsKey = templateKinds.join(",");
  useEffect(() => {
    if (templateKindsKey === "") return;
    getContentItemNames({ data: { kinds: templateKindsKey.split(",") as BuilderKind[] } })
      .then(setTemplateOptions)
      .catch(() => setTemplateOptions({}));
  }, [templateKindsKey]);

  const needsContactFields = fields.some((f) => f.type === "contact-field");
  const [contactFields, setContactFields] = useState<ContactFieldDef[] | null>(null);
  useEffect(() => {
    if (needsContactFields) getContactFields().then((v) => setContactFields(v.fields));
  }, [needsContactFields]);

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label className="text-xs">{f.label}</Label>
          {f.type === "textarea" ? (
            <Textarea
              value={config[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => onChange({ ...config, [f.key]: e.target.value })}
              className="min-h-[80px] resize-none"
            />
          ) : f.type === "select" ? (
            <Select
              value={config[f.key] ?? ""}
              onValueChange={(v) => onChange({ ...config, [f.key]: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={tr("Wybierz…")} />
              </SelectTrigger>
              <SelectContent>
                {/* The Polish option is the stored value the engine compares
                    against (e.g. mode "Usuń") — only its label is translated. */}
                {(f.options ?? []).map((o) => (
                  <SelectItem key={o} value={o}>
                    {tr(o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : f.type === "content-template" && f.templateKind ? (
            (() => {
              const options = templateOptions[f.templateKind] ?? [];
              const kindLabel = KIND_LABELS[f.templateKind];
              return options.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {tr("Brak pozycji w zakładce „")}
                  {kindLabel.title}
                  {tr("”. Utwórz ")} {kindLabel.singular}
                  {tr(", aby wybrać go tutaj jako szablon.")}
                </p>
              ) : (
                <Select
                  value={config[f.key] ?? ""}
                  onValueChange={(v) => onChange({ ...config, [f.key]: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tr("Wybierz…")} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            })()
          ) : f.type === "contact-field" ? (
            !contactFields ? (
              <p className="text-xs text-muted-foreground">{tr("Wczytywanie pól…")}</p>
            ) : (
              <Select
                value={config[f.key] ?? ""}
                onValueChange={(v) => onChange({ ...config, [f.key]: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tr("Wybierz pole…")} />
                </SelectTrigger>
                <SelectContent>
                  {contactFields
                    .filter((d) => d.visible)
                    .map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {d.label}
                        {d.builtin ? "" : tr(" (własne)")}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )
          ) : f.type === "sms-sender" ? (
            !senders ? (
              <p className="text-xs text-muted-foreground">{tr("Wczytywanie nadawców…")}</p>
            ) : senders.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {tr("Brak nadawców SMS — dodaj go w Integracje → SMS API.")}
              </p>
            ) : (
              <Select
                value={config[f.key] || DEFAULT_SENDER}
                onValueChange={(v) =>
                  onChange({ ...config, [f.key]: v === DEFAULT_SENDER ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_SENDER}>{tr("Domyślny nadawca")}</SelectItem>
                  {senders.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.value}
                      {s.kind === "alphanumeric" ? " (jednokierunkowy)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          ) : f.type === "funnel" ? (
            !funnels ? (
              <p className="text-xs text-muted-foreground">{tr("Wczytywanie lejków…")}</p>
            ) : funnels.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {tr("Brak lejków — utwórz go w zakładce „Lejki”, aby wybrać go tutaj.")}
              </p>
            ) : (
              <Select
                value={config[f.key] ?? ""}
                onValueChange={(v) => {
                  const funnel = funnels.find((fl) => fl.id === v);
                  onChange({
                    ...config,
                    [f.key]: v,
                    funnelName: funnel?.name ?? "",
                    stageId: "",
                    stageName: "",
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tr("Wybierz…")} />
                </SelectTrigger>
                <SelectContent>
                  {funnels.map((fl) => (
                    <SelectItem key={fl.id} value={fl.id}>
                      {fl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          ) : f.type === "funnel-stage" ? (
            (() => {
              const selectedFunnel = funnels?.find((fl) => fl.id === config.funnelId);
              if (!selectedFunnel) {
                return (
                  <p className="text-xs text-muted-foreground">
                    {tr("Najpierw wybierz lejek powyżej.")}
                  </p>
                );
              }
              if (selectedFunnel.stages.length === 0) {
                return (
                  <p className="text-xs text-muted-foreground">
                    {tr("Ten lejek nie ma jeszcze etapów.")}
                  </p>
                );
              }
              return (
                <Select
                  value={config[f.key] ?? ""}
                  onValueChange={(v) => {
                    const stage = selectedFunnel.stages.find((s) => s.id === v);
                    onChange({ ...config, [f.key]: v, stageName: stage?.label ?? "" });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tr("Wybierz…")} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedFunnel.stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            })()
          ) : (
            <Input
              type={f.type === "number" ? "number" : "text"}
              value={config[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => onChange({ ...config, [f.key]: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function NodeInspector({
  node,
  onOpenChange,
  onSave,
  readOnly = false,
}: {
  node: AutomationNode | null;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: AutomationNode) => void;
  /** Inspect-only: the step's settings stay readable, but cannot be changed. */
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState<AutomationNode | null>(node);

  useEffect(() => {
    setDraft(node);
  }, [node]);

  const open = !!draft;

  const save = () => {
    if (draft) onSave(draft);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto flex flex-col">
        <fieldset disabled={readOnly} className="contents">
          {draft && draft.kind === "trigger" && (
            <>
              <SheetHeader>
                <SheetTitle>{tr("Trigger")}</SheetTitle>
                <SheetDescription>
                  {tr("Zdarzenie, które uruchamia scenariusz komunikacji.")}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 flex-1">
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("Typ wyzwalacza")}</Label>
                  <Select
                    value={draft.key}
                    onValueChange={(key) => setDraft({ ...draft, key, config: {} })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {triggerCatalog.map((t) => (
                        <SelectItem key={t.key} value={t.key}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <EngineNote note={findCatalogItem("trigger", draft.key ?? "")?.engineNote} />
                <ConfigFields
                  fields={findCatalogItem("trigger", draft.key ?? "")?.fields ?? []}
                  config={draft.config ?? {}}
                  onChange={(config) => setDraft({ ...draft, config })}
                />
              </div>
            </>
          )}

          {draft && draft.kind === "delay" && (
            <>
              <SheetHeader>
                <SheetTitle>{tr("Poczekaj")}</SheetTitle>
                <SheetDescription>
                  {tr("Wstrzymuje ścieżkę pacjenta przed kolejnym krokiem.")}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 flex gap-3 flex-1">
                <div className="space-y-1.5 flex-1">
                  <Label className="text-xs">{tr("Czas")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={draft.amount}
                    onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label className="text-xs">{tr("Jednostka")}</Label>
                  <Select
                    value={draft.unit}
                    onValueChange={(unit) =>
                      setDraft({ ...draft, unit: unit as typeof draft.unit })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">{tr("minut")}</SelectItem>
                      <SelectItem value="hours">{tr("godzin")}</SelectItem>
                      <SelectItem value="days">{tr("dni")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {draft && draft.kind === "condition" && (
            <>
              <SheetHeader>
                <SheetTitle>{tr("Warunek")}</SheetTitle>
                <SheetDescription>
                  {tr("Rozdziela ścieżkę na „pasuje” i „nie pasuje”.")}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 flex-1">
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("Typ warunku")}</Label>
                  <Select
                    value={draft.key}
                    onValueChange={(key) => setDraft({ ...draft, key, config: {} })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {conditionCatalog.map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ConfigFields
                  fields={findCatalogItem("condition", draft.key ?? "")?.fields ?? []}
                  config={draft.config ?? {}}
                  onChange={(config) => setDraft({ ...draft, config })}
                />
              </div>
            </>
          )}

          {draft && draft.kind === "action" && (
            <>
              <SheetHeader>
                <SheetTitle>{tr("Akcja")}</SheetTitle>
                <SheetDescription>
                  {tr("Co system zrobi w tym kroku ścieżki pacjenta.")}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 flex-1">
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("Typ akcji")}</Label>
                  <Select
                    value={draft.key}
                    onValueChange={(key) => setDraft({ ...draft, key, config: {} })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {actionCatalog.map((a) => (
                        <SelectItem key={a.key} value={a.key}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <EngineNote note={findCatalogItem("action", draft.key ?? "")?.engineNote} />
                <EngineHint hint={findCatalogItem("action", draft.key ?? "")?.engineHint} />
                <ConfigFields
                  fields={findCatalogItem("action", draft.key ?? "")?.fields ?? []}
                  config={draft.config ?? {}}
                  onChange={(config) => setDraft({ ...draft, config })}
                />
              </div>
            </>
          )}

          {draft && draft.kind === "path" && (
            <>
              <SheetHeader>
                <SheetTitle>{tr("Rozgałęzienie")}</SheetTitle>
                <SheetDescription>
                  {tr("Kontakt schodzi ")} <strong>{tr("pierwszą")}</strong>{" "}
                  {tr(
                    " odnogą, której filtr spełnia — kolejność ma znaczenie. Odnoga bez filtra przepuszcza każdego, więc trzymaj taką na końcu jako „pozostali”.",
                  )}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 flex-1">
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("Nazwa kroku")}</Label>
                  <Input
                    value={draft.config?.label ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, config: { ...draft.config, label: e.target.value } })
                    }
                    placeholder={tr("np. Podział wg specjalizacji")}
                  />
                </div>

                {(draft.branches ?? []).map((branch, idx) => (
                  <BranchEditor
                    key={branch.id}
                    branch={branch}
                    index={idx}
                    removable={(draft.branches?.length ?? 0) > 2}
                    onChange={(next) => {
                      const branches = [...(draft.branches ?? [])];
                      branches[idx] = next;
                      setDraft({ ...draft, branches });
                    }}
                    onRemove={() =>
                      setDraft({
                        ...draft,
                        branches: (draft.branches ?? []).filter((_, i) => i !== idx),
                      })
                    }
                  />
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const branches = [...(draft.branches ?? [])];
                    // New branches go ABOVE the catch-all: appending after a
                    // filterless branch would make them unreachable.
                    const catchAllAt = branches.findIndex((b) => (b.filters?.length ?? 0) === 0);
                    const fresh = {
                      id: makeBranchId(),
                      label: tr("Odnoga {length}", { length: branches.length }),
                      match: "all" as const,
                      filters: [],
                    };
                    if (catchAllAt === -1) branches.push(fresh);
                    else branches.splice(catchAllAt, 0, fresh);
                    setDraft({ ...draft, branches });
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> {tr(" Dodaj odnogę")}
                </Button>
              </div>
            </>
          )}

          {draft && draft.kind === "split" && (
            <>
              <SheetHeader>
                <SheetTitle>{tr("Split A/B")}</SheetTitle>
                <SheetDescription>
                  {tr(
                    "Każdy kontakt trafia losowo do jednego wariantu, zgodnie z zadanymi procentami. Losowanie jest niezależne dla każdego kontaktu.",
                  )}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 flex-1">
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("Nazwa kroku")}</Label>
                  <Input
                    value={draft.config?.label ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, config: { ...draft.config, label: e.target.value } })
                    }
                    placeholder={tr("np. Test tematu wiadomości")}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">{tr("Warianty")}</Label>
                  {(draft.variants ?? []).map((variant, idx) => (
                    <div key={variant.id} className="flex items-center gap-2">
                      <Input
                        value={variant.label}
                        onChange={(e) => {
                          const variants = [...(draft.variants ?? [])];
                          variants[idx] = { ...variant, label: e.target.value };
                          setDraft({ ...draft, variants });
                        }}
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          className="w-20"
                          value={variant.weight}
                          onChange={(e) => {
                            const variants = [...(draft.variants ?? [])];
                            variants[idx] = { ...variant, weight: Number(e.target.value) || 0 };
                            setDraft({ ...draft, variants });
                          }}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                      {(draft.variants?.length ?? 0) > 2 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive shrink-0"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              variants: (draft.variants ?? []).filter((_, i) => i !== idx),
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}

                  {(() => {
                    const total = (draft.variants ?? []).reduce((sum, v) => sum + v.weight, 0);
                    // Weights are shares of their own sum, so 30/30 still splits
                    // evenly — but if someone meant percentages, say what they got.
                    return total === 100 ? (
                      <p className="text-[11px] text-muted-foreground">{tr("Suma: 100%.")}</p>
                    ) : (
                      <p className="text-[11px] text-warning-foreground">
                        {tr("Suma wag to ")} {total}
                        {tr(", nie 100. Podział zadziała proporcjonalnie (")}
                        {(draft.variants ?? [])
                          .map(
                            (v) =>
                              `${v.label}: ${total > 0 ? Math.round((v.weight / total) * 100) : 0}%`,
                          )
                          .join(", ")}
                        ).
                      </p>
                    );
                  })()}

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        variants: [
                          ...(draft.variants ?? []),
                          {
                            id: makeBranchId(),
                            label: tr("Wariant {v0}", {
                              v0: String.fromCharCode(65 + (draft.variants?.length ?? 0)),
                            }),
                            weight: 0,
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> {tr(" Dodaj wariant")}
                  </Button>
                </div>
              </div>
            </>
          )}

          {draft && draft.kind === "aiAgent" && (
            <>
              <SheetHeader>
                <SheetTitle>{tr("Agent AI — inteligentny router")}</SheetTitle>
                <SheetDescription>
                  {tr(
                    "Opisz cel, a agent w czasie rzeczywistym oceni kontakt i skieruje go do jednej ze ścieżek.",
                  )}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 flex-1">
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("Cel agenta")}</Label>
                  <Textarea
                    value={draft.goal ?? ""}
                    onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
                    placeholder={tr(
                      "np. Oceń ryzyko nieobecności pacjenta i dobierz kanał przypomnienia",
                    )}
                    className="min-h-[90px] resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{tr("Ścieżki decyzyjne")}</Label>
                  {(draft.paths ?? []).map((p, idx) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <Input
                        value={p.label}
                        onChange={(e) => {
                          const paths = [...(draft.paths ?? [])];
                          paths[idx] = { ...p, label: e.target.value };
                          setDraft({ ...draft, paths });
                        }}
                      />
                      {(draft.paths?.length ?? 0) > 2 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive shrink-0"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              paths: (draft.paths ?? []).filter((_, i) => i !== idx),
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        paths: [
                          ...(draft.paths ?? []),
                          {
                            id: nodeId("path"),
                            label: tr("Ścieżka {v0}", { v0: (draft.paths?.length ?? 0) + 1 }),
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> {tr(" Dodaj ścieżkę")}
                  </Button>
                </div>

                <div className="space-y-2 rounded-lg border border-border p-3">
                  <Label className="text-xs">{tr("Uprawnienia agenta")}</Label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {tr(
                      "Poza wyborem ścieżki agent może porządkować bazę. Domyślnie nie może nic — włącz tylko to, na co mu pozwalasz w tym procesie.",
                    )}
                  </p>
                  {AGENT_PERMISSIONS.map((perm) => (
                    <div key={perm.key}>
                      <div className="flex items-start justify-between gap-3 pt-1">
                        <div className="min-w-0">
                          <div className="text-xs font-medium">{perm.label}</div>
                          <div className="text-[11px] text-muted-foreground">{perm.hint}</div>
                        </div>
                        <Switch
                          checked={(draft.config?.[perm.key] ?? "") === "1"}
                          onCheckedChange={(on) =>
                            setDraft({
                              ...draft,
                              config: { ...(draft.config ?? {}), [perm.key]: on ? "1" : "0" },
                            })
                          }
                        />
                      </div>

                      {perm.key === "canWriteMessages" &&
                        (draft.config?.canWriteMessages ?? "") === "1" && (
                          <div className="mt-2 ml-3 pl-3 border-l border-border space-y-2">
                            <div className="text-[11px] font-medium">
                              {tr("Z czego może korzystać")}
                            </div>
                            {KNOWLEDGE_SCOPES.map((scope) => {
                              const current = draft.config?.knowledgeScope ?? "internal";
                              return (
                                <label
                                  key={scope.value}
                                  className="flex items-start gap-2 cursor-pointer"
                                >
                                  <input
                                    type="radio"
                                    className="mt-0.5 accent-primary"
                                    checked={current === scope.value}
                                    onChange={() =>
                                      setDraft({
                                        ...draft,
                                        config: {
                                          ...(draft.config ?? {}),
                                          knowledgeScope: scope.value,
                                        },
                                      })
                                    }
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-[11px] font-medium">
                                      {scope.label}
                                    </span>
                                    <span className="block text-[11px] text-muted-foreground">
                                      {scope.hint}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                            <p className="text-[11px] text-warning-foreground bg-warning/10 border border-warning/30 rounded px-2 py-1.5 leading-relaxed">
                              {tr("Agent wysyła ")} <strong>{tr("e-mailem")}</strong>{" "}
                              {tr(" (SendGrid) i")} <strong>{tr("SMS-em")}</strong>{" "}
                              {tr(
                                " (Twilio) — te kanały działają. Odpowiadanie na wiadomości z Messengera i WhatsAppa wymaga integracji, której system jeszcze nie ma. Pacjenci ze statusem „nie kontaktować” są pomijani.",
                              )}
                            </p>
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </fieldset>

        {draft && (
          <SheetFooter className="mt-6">
            {readOnly ? (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {tr("Zamknij")}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {tr("Anuluj")}
                </Button>
                <Button onClick={save}>{tr("Zapisz")}</Button>
              </>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
