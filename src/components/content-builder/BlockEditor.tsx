import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { GripVertical, Copy, Trash2, Upload, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { applyDrop, moveDragPayload, paletteDragPayload } from "@/lib/content-builder-dnd";
import { getTreatmentPlans } from "@/lib/api/treatment-plans.functions";
import {
  BLOCK_PALETTES,
  COLUMN_RATIOS,
  columnWidths,
  makeBlock,
  paletteEntry,
  PERSONALIZATION_FIELDS,
  FONT_FAMILIES,
  FONT_SIZES,
  FORM_FIELDS,
  parseFormFields,
  serializeFormFields,
  customFieldName,
  parseBlockTags,
  parseSurveyQuestions,
  serializeSurveyQuestions,
  makeSurveyQuestion,
  SURVEY_QUESTION_LABELS,
  legacyTextToHtml,
  type BlockType,
  type ContentBlock,
  type BuilderKind,
  type FormFieldSpec,
  type SurveyQuestion,
  type SurveyQuestionType,
} from "@/lib/content-builder";
import { BlockPreview } from "@/components/content-builder/BlockPreview";
import { RichTextEditor } from "@/components/content-builder/RichTextEditor";
import { AttachmentBlockPicker } from "@/components/content-builder/AttachmentBlockPicker";
import { TagInput } from "@/components/content-builder/TagInput";
import { t as tr } from "@/lib/i18n";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ImageUploadField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={tr("https://… lub wgraj plik")}
          className="text-xs"
        />
        <label className="shrink-0">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) onChange(await readFileAsDataUrl(f));
            }}
          />
          <span className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-input hover:bg-accent cursor-pointer">
            <Upload className="h-4 w-4" />
          </span>
        </label>
      </div>
      {value && (
        <img src={value} alt="" className="h-14 rounded-md border border-border object-cover" />
      )}
    </div>
  );
}

/** Simple font-family/size/color picker for blocks that don't need the full rich-text toolbar (heading/footer/button). */
function TypographyFields({
  data,
  onChange,
}: {
  data: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1.5 col-span-2">
        <Label className="text-xs">{tr("Czcionka")}</Label>
        <Select
          value={data.fontFamily || "inherit"}
          onValueChange={(v) => onChange({ fontFamily: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((f) => (
              <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Rozmiar (px)")}</Label>
        <Select value={data.fontSize || ""} onValueChange={(v) => onChange({ fontSize: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={tr("Domyślny")} />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
                {tr("px")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Kolor")}</Label>
        <input
          type="color"
          value={data.color || "#111827"}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-8 w-full cursor-pointer rounded-md border border-input bg-transparent p-0.5"
        />
      </div>
    </div>
  );
}

/** Field list + copy + tags for the popup form block. Split out of BlockInspector because it needs its own draft state for adding custom fields. */
function FormBlockInspector({
  data: d,
  set,
}: {
  data: Record<string, string>;
  set: (patch: Record<string, string>) => void;
}) {
  const fields = parseFormFields(d);
  const [newLabel, setNewLabel] = useState("");

  const writeFields = (next: FormFieldSpec[]) => set({ fields: serializeFormFields(next) });

  const toggleBuiltin = (def: (typeof FORM_FIELDS)[number]) => {
    const present = fields.some((f) => f.name === def.name);
    writeFields(
      present
        ? fields.filter((f) => f.name !== def.name)
        : [
            ...fields,
            {
              name: def.name,
              label: def.label,
              type: def.type,
              required: !!def.required,
              custom: false,
            },
          ],
    );
  };

  const addCustom = () => {
    const label = newLabel.trim();
    if (!label) return;
    const name = customFieldName(label);
    if (fields.some((f) => f.name === name)) return;
    writeFields([...fields, { name, label, type: "text", required: false, custom: true }]);
    setNewLabel("");
  };

  const patchField = (name: string, patch: Partial<FormFieldSpec>) =>
    writeFields(fields.map((f) => (f.name === name ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Pola standardowe")}</Label>
        <div className="space-y-1.5">
          {FORM_FIELDS.map((def) => {
            const active = fields.find((f) => f.name === def.name);
            return (
              <label
                key={def.name}
                className={cn(
                  "flex items-center gap-2 text-xs rounded-md border border-border px-2.5 py-2",
                  def.required && "opacity-70",
                )}
              >
                <input
                  type="checkbox"
                  checked={!!active}
                  disabled={def.required}
                  onChange={() => toggleBuiltin(def)}
                />
                <span>{def.label}</span>
                {def.required && (
                  <span className="text-muted-foreground">{tr("(zawsze wymagane)")}</span>
                )}
                {active && !def.required && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      patchField(def.name, { required: !active.required });
                    }}
                    className={cn(
                      "ml-auto text-[10px] rounded px-1.5 py-0.5 border",
                      active.required
                        ? "border-primary/40 bg-primary-soft text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {active.required ? "wymagane" : "opcjonalne"}
                  </button>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Pola własne")}</Label>
        {fields.filter((f) => f.custom).length > 0 && (
          <div className="space-y-1.5">
            {fields
              .filter((f) => f.custom)
              .map((f) => (
                <div key={f.name} className="rounded-md border border-border p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={f.label}
                      onChange={(e) => patchField(f.name, { label: e.target.value })}
                      className="h-7 text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive"
                      onClick={() => writeFields(fields.filter((x) => x.name !== f.name))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={f.type}
                      onValueChange={(v) =>
                        patchField(f.name, { type: v as FormFieldSpec["type"] })
                      }
                    >
                      <SelectTrigger className="h-7 text-[11px] flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">{tr("Tekst")}</SelectItem>
                        <SelectItem value="textarea">{tr("Dłuższy tekst")}</SelectItem>
                        <SelectItem value="tel">{tr("Telefon")}</SelectItem>
                        <SelectItem value="email">{tr("E-mail")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => patchField(f.name, { required: !f.required })}
                      className={cn(
                        "text-[10px] rounded px-2 py-1 border shrink-0",
                        f.required
                          ? "border-primary/40 bg-primary-soft text-primary"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {f.required ? "wymagane" : "opcjonalne"}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder={tr("np. Skąd wiesz o nas?")}
            className="h-8 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1"
            onClick={addCustom}
          >
            <Plus className="h-3.5 w-3.5" /> {tr(" Dodaj")}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {tr("Odpowiedzi na pola własne trafiają jako notatka do karty kontaktu.")}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Napis na przycisku")}</Label>
        <Input
          value={d.submitLabel || ""}
          onChange={(e) => set({ submitLabel: e.target.value })}
          placeholder={tr("Zapisz się")}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Komunikat po wysłaniu")}</Label>
        <Input
          value={d.successMessage || ""}
          onChange={(e) => set({ successMessage: e.target.value })}
          placeholder={tr("Dziękujemy!")}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Tekst zgody (puste = bez checkboxa)")}</Label>
        <Textarea
          value={d.consentText || ""}
          onChange={(e) => set({ consentText: e.target.value })}
          className="min-h-[64px] text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Tagi nadawane kontaktowi")}</Label>
        <TagInput
          value={parseBlockTags(d)}
          onChange={(tags) => set({ tags: JSON.stringify(tags) })}
        />
        <p className="text-[11px] text-muted-foreground">
          {tr('Każde wysłanie tworzy kontakt w zakładce Contacts (status „Lead") z tymi tagami.')}
        </p>
      </div>
    </div>
  );
}

/** Question list for the survey block: add/remove/reorder, per-question type, options and required flag. */
function SurveyBlockInspector({
  data: d,
  set,
}: {
  data: Record<string, string>;
  set: (patch: Record<string, string>) => void;
}) {
  const questions = parseSurveyQuestions(d);
  const write = (next: SurveyQuestion[]) => set({ questions: serializeSurveyQuestions(next) });
  const patch = (id: string, p: Partial<SurveyQuestion>) =>
    write(questions.map((q) => (q.id === id ? { ...q, ...p } : q)));

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    write(next);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs">{tr("Pytania")}</Label>
        {questions.map((q, idx) => (
          <div key={q.id} className="rounded-md border border-border p-2 space-y-2">
            <div className="flex items-start gap-1.5">
              <Textarea
                value={q.text}
                onChange={(e) => patch(q.id, { text: e.target.value })}
                placeholder={tr("Treść pytania")}
                className="min-h-[48px] text-xs"
              />
              <div className="flex flex-col gap-0.5 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={idx === 0}
                  onClick={() => move(idx, -1)}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={idx === questions.length - 1}
                  onClick={() => move(idx, 1)}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive"
                  onClick={() => write(questions.filter((x) => x.id !== q.id))}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Select
                value={q.type}
                onValueChange={(v) => patch(q.id, { type: v as SurveyQuestionType })}
              >
                <SelectTrigger className="h-7 text-[11px] flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SURVEY_QUESTION_LABELS) as SurveyQuestionType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {SURVEY_QUESTION_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => patch(q.id, { required: !q.required })}
                className={cn(
                  "text-[10px] rounded px-2 py-1 border shrink-0",
                  q.required
                    ? "border-primary/40 bg-primary-soft text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {q.required ? "wymagane" : "opcjonalne"}
              </button>
            </div>

            {q.type === "single" && (
              <div className="space-y-1.5">
                <Label className="text-[11px]">{tr("Opcje (każda w nowej linii)")}</Label>
                <Textarea
                  value={q.options.join("\n")}
                  onChange={(e) =>
                    patch(q.id, {
                      options: e.target.value
                        .split("\n")
                        .map((o) => o.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={tr("Tak\nNie\nNie wiem")}
                  className="min-h-[64px] text-xs"
                />
              </div>
            )}
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full gap-1.5 h-8"
          onClick={() => write([...questions, makeSurveyQuestion()])}
        >
          <Plus className="h-3.5 w-3.5" /> {tr(" Dodaj pytanie")}
        </Button>
      </div>

      <label className="flex items-center gap-2 text-xs rounded-md border border-border px-2.5 py-2">
        <input
          type="checkbox"
          checked={d.askEmail === "1"}
          onChange={(e) => set({ askEmail: e.target.checked ? "1" : "0" })}
        />
        <span>{tr("Pytaj o e-mail")}</span>
      </label>
      <p className="text-[11px] text-muted-foreground -mt-1.5">
        {tr(
          "Pacjent kliknięty z e-maila jest rozpoznawany automatycznie. Bez tego pola anonimowy odwiedzający nie zostanie przypisany do żadnej karty i ankieta nie zapisze się.",
        )}
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Napis na przycisku")}</Label>
        <Input
          value={d.submitLabel || ""}
          onChange={(e) => set({ submitLabel: e.target.value })}
          placeholder={tr("Wyślij odpowiedzi")}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Komunikat po wysłaniu")}</Label>
        <Input
          value={d.successMessage || ""}
          onChange={(e) => set({ successMessage: e.target.value })}
          placeholder={tr("Dziękujemy!")}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Tagi (dla nowo utworzonych kontaktów)")}</Label>
        <TagInput
          value={parseBlockTags(d)}
          onChange={(tags) => set({ tags: JSON.stringify(tags) })}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {tr("Odpowiedzi zapisują się jako notatka w karcie kontaktu (zakładka Notatki).")}
      </p>
    </div>
  );
}

export function BlockInspector({
  block,
  onUpdate,
}: {
  block: ContentBlock;
  onUpdate: (data: Record<string, string>) => void;
}) {
  const d = block.data;
  const set = (patch: Record<string, string>) => onUpdate({ ...d, ...patch });

  const AlignField = (
    <div className="space-y-1.5">
      <Label className="text-xs">{tr("Wyrównanie")}</Label>
      <Select value={d.align || "left"} onValueChange={(v) => set({ align: v })}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="left">{tr("Do lewej")}</SelectItem>
          <SelectItem value="center">{tr("Wyśrodkuj")}</SelectItem>
          <SelectItem value="right">{tr("Do prawej")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  switch (block.type) {
    case "header":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Nazwa / logo (tekst)")}</Label>
            <Input value={d.logoText || ""} onChange={(e) => set({ logoText: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Slogan")}</Label>
            <Input value={d.tagline || ""} onChange={(e) => set({ tagline: e.target.value })} />
          </div>
          <ImageUploadField
            label={tr("Logo (obraz)")}
            value={d.logoImageUrl || ""}
            onChange={(url) => set({ logoImageUrl: url })}
          />
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Adres odnośnika")}</Label>
            <Input
              value={d.linkUrl || ""}
              onChange={(e) => set({ linkUrl: e.target.value })}
              placeholder="https://klinika-abc.pl"
            />
            <p className="text-[11px] text-muted-foreground">
              {tr(
                "Po podaniu adresu cały nagłówek staje się klikalny — logo prowadzące na stronę placówki to standard w mailingu.",
              )}
            </p>
          </div>
        </div>
      );
    case "heading":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Treść")}</Label>
            <Input value={d.text || ""} onChange={(e) => set({ text: e.target.value })} />
          </div>
          {AlignField}
          <TypographyFields data={d} onChange={set} />
        </div>
      );
    case "text":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Treść")}</Label>
            <RichTextEditor
              value={d.html || (d.text ? legacyTextToHtml(d.text) : "")}
              onChange={(html) => set({ html })}
            />
          </div>
          {AlignField}
        </div>
      );
    case "html":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Treść (HTML)")}</Label>
            <RichTextEditor
              value={d.html || ""}
              onChange={(html) => set({ html })}
              minHeight={160}
            />
          </div>
          {AlignField}
        </div>
      );
    case "image":
      return (
        <div className="space-y-3">
          <ImageUploadField
            label={tr("Obraz")}
            value={d.url || ""}
            onChange={(url) => set({ url })}
          />
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Tekst alternatywny")}</Label>
            <Input value={d.alt || ""} onChange={(e) => set({ alt: e.target.value })} />
          </div>
        </div>
      );
    case "button":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Etykieta")}</Label>
            <Input value={d.label || ""} onChange={(e) => set({ label: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Link")}</Label>
            <Input
              value={d.url || ""}
              onChange={(e) => set({ url: e.target.value })}
              placeholder="https://"
            />
          </div>
          {AlignField}
          <TypographyFields data={d} onChange={set} />
        </div>
      );
    case "spacer":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{tr("Wysokość (px)")}</Label>
          <Input
            type="number"
            value={d.height || "24"}
            onChange={(e) => set({ height: e.target.value })}
          />
        </div>
      );
    case "social":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Facebook")}</Label>
            <Input
              value={d.facebook || ""}
              onChange={(e) => set({ facebook: e.target.value })}
              placeholder="https://facebook.com/…"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Instagram")}</Label>
            <Input
              value={d.instagram || ""}
              onChange={(e) => set({ instagram: e.target.value })}
              placeholder="https://instagram.com/…"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("LinkedIn")}</Label>
            <Input
              value={d.linkedin || ""}
              onChange={(e) => set({ linkedin: e.target.value })}
              placeholder="https://linkedin.com/…"
            />
          </div>
        </div>
      );
    case "columns":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Liczba kolumn")}</Label>
            <div className="flex gap-2">
              {[2, 3].map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  variant={Number(d.count) === n ? "default" : "outline"}
                  onClick={() =>
                    set({
                      count: String(n),
                      // Proporcja musi pasować do liczby kolumn — inaczej
                      // szerokości cofnęłyby się do równych bez wyjaśnienia.
                      ratio: COLUMN_RATIOS[n][0].value,
                    })
                  }
                >
                  {n}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tr(
                "Cztery kolumny i więcej to w wiadomości nieczytelne paski — dlatego lista kończy się na trzech.",
              )}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Proporcje")}</Label>
            <Select value={d.ratio || "1:1"} onValueChange={(v) => set({ ratio: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(COLUMN_RATIOS[Number(d.count) || 2] ?? []).map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Odstęp między kolumnami (px)")}</Label>
            <Input
              inputMode="numeric"
              value={d.gap ?? "16"}
              onChange={(e) => set({ gap: e.target.value })}
            />
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {tr("Na telefonie kolumny ")} <b>{tr("składają się jedna pod drugą")}</b>
            {tr(
              ". Outlook na Windows tego nie zrobi i zostawi je obok siebie — przy dwóch kolumnach to w porządku, przy trzech robi się ciasno.",
            )}
          </p>
        </div>
      );
    case "attachments":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Nagłówek listy")}</Label>
            <Input
              value={d.title ?? ""}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={tr("np. Do pobrania")}
            />
          </div>
          <AttachmentBlockPicker value={d.fileIds ?? ""} onChange={(fileIds) => set({ fileIds })} />
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Jak wysłać")}</Label>
            <select
              value={(d.mode ?? "attach").trim() || "attach"}
              onChange={(e) => set({ mode: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="attach">{tr("Załącznik doklejony do wiadomości")}</option>
              <option value="link">{tr("Odnośnik do pobrania z biblioteki")}</option>
            </select>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {(d.mode ?? "attach").trim() === "link" ? (
              <>
                {tr("Plik zostaje w bibliotece Media, a w wiadomości jest po niego ")}{" "}
                <b>{tr("odnośnik")}</b>
                {tr(
                  ". Tak wysyła się rzeczy ciężkie: plan na 8 MB trafia do tysiąca osób bez wysyłania ośmiu gigabajtów.",
                )}
              </>
            ) : (
              <>
                {tr("Pliki jadą jako ")} <b>{tr("prawdziwe załączniki")}</b>
                {tr(
                  ", osobno do każdego odbiorcy. Łączny limit to 22 MB na wiadomość — więcej odrzuca SendGrid, bo liczy 30 MB na całą wiadomość już po zakodowaniu. Przy ciężkich plikach i dużym segmencie rozważ odnośnik.",
                )}
              </>
            )}
          </p>
          {AlignField}
        </div>
      );
    case "plan":
      return <PlanBlockFields d={d} set={set} AlignField={AlignField} />;
    case "footer":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Treść stopki")}</Label>
            {/* Bogaty tekst, nie zwykłe pole: w stopce trzeba móc wstawić
                odnośnik do regulaminu, polityki prywatności i wypisania.
                Stopki sprzed tej zmiany wchodzą tu ze swoim `text`. */}
            <RichTextEditor
              value={d.html || (d.text ? legacyTextToHtml(d.text) : "")}
              onChange={(html) => set({ html })}
              minHeight={90}
            />
          </div>
          <ImageUploadField
            label={tr("Baner / logo stopki")}
            value={d.imageUrl || ""}
            onChange={(url) => set({ imageUrl: url })}
          />
          {AlignField}
          <TypographyFields data={d} onChange={set} />
        </div>
      );
    case "form":
      return <FormBlockInspector data={d} set={set} />;
    case "survey":
      return <SurveyBlockInspector data={d} set={set} />;
    case "divider":
      return (
        <p className="text-xs text-muted-foreground">
          {tr("Ten blok nie ma ustawień — po prostu oddziela sekcje linią.")}
        </p>
      );
    case "personalization": {
      const groups = [...new Set(PERSONALIZATION_FIELDS.map((f) => f.group))];
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Dane z karty kontaktu")}</Label>
            <Select value={d.field || "firstName"} onValueChange={(v) => set({ field: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {PERSONALIZATION_FIELDS.filter((f) => f.group === group).map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("Tekst przed")}</Label>
              <Input
                value={d.prefix || ""}
                onChange={(e) => set({ prefix: e.target.value })}
                placeholder={tr("np. Cześć ")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("Tekst po")}</Label>
              <Input
                value={d.suffix || ""}
                onChange={(e) => set({ suffix: e.target.value })}
                placeholder={tr("np. !")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("Wartość zastępcza (gdy brak danych)")}</Label>
            <Input
              value={d.fallback || ""}
              onChange={(e) => set({ fallback: e.target.value })}
              placeholder={tr("np. Pacjencie")}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {tr(
              "Na płótnie zobaczysz nazwę pola — w wysyłce (i teście) zostanie zamienione na prawdziwe dane kontaktu.",
            )}
          </p>
        </div>
      );
    }
    default:
      return null;
  }
}

/**
 * Czy ten blok da się edytować wprost na płótnie.
 *
 * Tylko bloki, których treścią jest tekst. Obraz, przycisk czy stopka mają
 * ustawienia (adres, etykieta, odnośnik), których nie da się wyrazić pisaniem
 * w treści — te zostają w panelu po prawej.
 */
/**
 * Ustawienia bloku „Plan leczenia".
 *
 * Lista planów pochodzi **z bazy**, nie ze stałej w kodzie — nazwa wpisana
 * ręcznie z literówką dawałaby znacznik bez pokrycia i pustkę w wiadomości.
 * Pusty wybór znaczy „plan ostatnio przypisany temu pacjentowi" i to jest
 * przypadek, dla którego blok powstał: jeden newsletter do segmentu, w którym
 * każdy dostaje swój plan.
 */
function PlanBlockFields({
  d,
  set,
  AlignField,
}: {
  d: Record<string, string>;
  set: (patch: Record<string, string>) => void;
  AlignField: ReactNode;
}) {
  const [plans, setPlans] = useState<{ id: string; name: string }[] | null>(null);

  useEffect(() => {
    getTreatmentPlans()
      .then((r) => setPlans(r.plans.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => setPlans([]));
  }, []);

  const chosen = (d.planName ?? "").trim();
  // Plan mógł zostać przemianowany albo skasowany po wstawieniu bloku.
  // Milczące pokazanie „ostatni przypisany" ukryłoby, że wiadomość powołuje
  // się na coś, czego już nie ma.
  const missing = chosen !== "" && plans !== null && !plans.some((p) => p.name === chosen);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Nagłówek")}</Label>
        <Input
          value={d.title ?? ""}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={tr("np. Twój plan leczenia")}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{tr("Który plan")}</Label>
        <select
          value={chosen}
          onChange={(e) => set({ planName: e.target.value })}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">{tr("Plan ostatnio przypisany pacjentowi")}</option>
          {(plans ?? []).map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
          {missing && (
            <option value={chosen}>
              {chosen} {tr(" — nie ma już takiego planu")}
            </option>
          )}
        </select>
      </div>

      {missing && (
        <p className="text-[11px] leading-relaxed text-destructive">
          {tr("Planu „")}
          {chosen}
          {tr(
            '" nie ma już na liście. Wiadomość wyśle się bez tego fragmentu — wybierz inny plan albo zostaw „ostatnio przypisany".',
          )}
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {tr("Treść planu wchodzi do wiadomości ")}{" "}
        <b>{tr("przy wysyłce, osobno dla każdego odbiorcy")}</b>
        {tr(
          ". W podglądzie widać znacznik, bo tu nie ma jeszcze pacjenta, któremu plan przypisano.",
        )}
      </p>

      {AlignField}
    </div>
  );
}

export function inlineEditable(block: ContentBlock): boolean {
  return block.type === "heading" || block.type === "text" || block.type === "html";
}

/** Treść bloku w postaci HTML — ze ścieżką dla bloków sprzed edytora bogatego tekstu. */
export function inlineValue(block: ContentBlock): string {
  const d = block.data;
  return (d.html as string) || (d.text ? legacyTextToHtml(d.text as string) : "");
}

/**
 * Zapis edycji na płótnie z powrotem do właściwego pola bloku.
 *
 * **Nagłówek trzyma treść w `text`, nie w `html`.** Renderer i podgląd czytają
 * z niego zwykły napis (`escapeHtml(d.text)`), więc zapisanie tam HTML-a
 * z edytora bogatego tekstu znikało bez śladu: podczas pisania widać było nowy
 * tekst, a po odkliknięciu bloku wracał stary — i taki właśnie szedł
 * w wiadomości. Dlatego dla nagłówka odbieramy znaczniki i zapisujemy sam
 * tekst; akapit i blok HTML dostają HTML bez zmian.
 */
export function inlinePatch(block: ContentBlock, html: string): Record<string, string> {
  if (block.type !== "heading") return { ...block.data, html };
  return { ...block.data, text: htmlToPlainText(html), html: "" };
}

/** Sam tekst z fragmentu HTML — encje rozwinięte, `<br>` na spację. */
function htmlToPlainText(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, "");
  const el = document.createElement("div");
  el.innerHTML = html.replace(/<br\s*\/?>/gi, " ");
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function BlockEditor({
  kind,
  blocks,
  onChange,
  narrow = false,
}: {
  kind: BuilderKind;
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  narrow?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const palette = BLOCK_PALETTES[kind];
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  const insertAt = (index: number, dt: DataTransfer) => {
    // Wspólna z Design Studiem — patrz `content-builder-dnd.ts`. Dwie kopie
    // tej logiki rozjechałyby się przy pierwszej poprawce, a to ta sama treść
    // w bazie, tylko otwarta na innym ekranie.
    const result = applyDrop(blocks, index, dt.getData("text/plain"));
    if (result.changed) {
      onChange(result.blocks);
      if (result.selectId) setSelectedId(result.selectId);
    }
    setOverIndex(null);
  };

  const onDropAt = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    insertAt(index, e.dataTransfer);
  };
  const onDragOverAt = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOverIndex(index);
  };

  /**
   * Zmiana danych bloku — także takiego, który siedzi w kolumnie.
   *
   * Zagnieżdżenie jest płytkie (jeden poziom), więc wystarczy przejść listę
   * i jej kolumny; rekurencja byłaby tu udawaniem ogólności, której model
   * świadomie nie ma.
   */
  const updateBlock = (id: string, data: Record<string, string>) => {
    onChange(
      blocks.map((b) => {
        if (b.id === id) return { ...b, data, columns: resizeColumns(b, data) };
        if (!b.columns) return b;
        return {
          ...b,
          columns: b.columns.map((col) => col.map((c) => (c.id === id ? { ...c, data } : c))),
        };
      }),
    );
  };

  /** Blok po identyfikatorze — z listy głównej albo z którejś kolumny. */
  const findBlock = (id: string | null): ContentBlock | null => {
    if (!id) return null;
    for (const b of blocks) {
      if (b.id === id) return b;
      for (const col of b.columns ?? []) {
        const hit = col.find((c) => c.id === id);
        if (hit) return hit;
      }
    }
    return null;
  };

  /** Wstawienie bloku do wskazanej kolumny wskazanego bloku kolumnowego. */
  const insertIntoColumn = (columnsBlockId: string, colIndex: number, dt: DataTransfer) => {
    const payload = dt.getData("text/plain");
    if (!payload.startsWith("new:")) return;
    const type = payload.slice(4) as BlockType;
    // Kolumny w kolumnach byłyby układem, którego nie da się ani sensownie
    // edytować, ani przewidywalnie wyrenderować w Outlooku.
    if (type === "columns") return;
    const block = makeBlock(type);
    onChange(
      blocks.map((b) =>
        b.id === columnsBlockId
          ? {
              ...b,
              columns: (b.columns ?? []).map((col, i) => (i === colIndex ? [...col, block] : col)),
            }
          : b,
      ),
    );
    setSelectedId(block.id);
  };

  /** Usunięcie bloku z kolumny. */
  const deleteFromColumn = (columnsBlockId: string, id: string) => {
    onChange(
      blocks.map((b) =>
        b.id === columnsBlockId
          ? { ...b, columns: (b.columns ?? []).map((col) => col.filter((c) => c.id !== id)) }
          : b,
      ),
    );
    if (selectedId === id) setSelectedId(null);
  };
  const duplicateBlock = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const copy = makeBlock(blocks[idx].type, { ...blocks[idx].data });
    const next = [...blocks];
    next.splice(idx + 1, 0, copy);
    onChange(next);
  };
  const deleteBlock = (id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="flex h-full min-h-[520px] gap-4">
      {/* Palette */}
      <div className="w-44 shrink-0 space-y-1.5 overflow-y-auto pr-1">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
          {tr("Bloki")}
        </p>
        {palette.map((p) => (
          <div
            key={p.type}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", paletteDragPayload(p.type))}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-xs cursor-grab active:cursor-grabbing hover:border-primary/40 hover:bg-primary-soft/40 transition-colors select-none"
          >
            <p.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {p.label}
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-muted/20 p-6">
        <div className={cn("mx-auto space-y-0", narrow ? "max-w-[380px]" : "max-w-[600px]")}>
          <div
            onDragOver={onDragOverAt(0)}
            onDrop={onDropAt(0)}
            className={cn("h-2 rounded transition-colors", overIndex === 0 && "h-3 bg-primary/30")}
          />
          {blocks.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              {tr("Przeciągnij blok z lewej strony, aby rozpocząć")}
            </div>
          )}
          {blocks.map((block, idx) => {
            const meta = paletteEntry(block.type);
            return (
              <div key={block.id}>
                <div
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", moveDragPayload(idx))}
                  onClick={() => setSelectedId(block.id)}
                  className={cn(
                    "group relative rounded-lg border bg-card p-3 cursor-pointer transition-colors",
                    selectedId === block.id
                      ? "border-primary ring-1 ring-primary"
                      : "border-transparent hover:border-border",
                  )}
                >
                  <div className="absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-muted-foreground cursor-grab">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                      {meta?.label}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateBlock(block.id);
                      }}
                      className="h-6 w-6 rounded-md bg-background border border-border flex items-center justify-center hover:bg-accent cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteBlock(block.id);
                      }}
                      className="h-6 w-6 rounded-md bg-background border border-border flex items-center justify-center hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {/* Edycja WPROST NA PODGLĄDZIE.
                      Zaznaczony blok tekstowy zamienia się w edytor w tym samym
                      miejscu, zamiast odsyłać do panelu po prawej. Wcześniej
                      trzeba było pisać w jednym miejscu, a patrzeć w drugie —
                      i to tam trafiała wklejana treść, więc nie było widać, co
                      się z nią stało. Panel po prawej zostaje: tam są rzeczy,
                      których nie da się pokazać w treści (wyrównanie, kolory). */}
                  {block.type === "columns" ? (
                    <ColumnsCanvas
                      block={block}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onDropInto={(colIndex, dt) => insertIntoColumn(block.id, colIndex, dt)}
                      onDeleteInner={(id) => deleteFromColumn(block.id, id)}
                      onUpdateInner={(id, data) => updateBlock(id, data)}
                    />
                  ) : selectedId === block.id && inlineEditable(block) ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <RichTextEditor
                        value={inlineValue(block)}
                        onChange={(html) => updateBlock(block.id, inlinePatch(block, html))}
                        minHeight={block.type === "heading" ? 32 : 60}
                        toolbar={false}
                        className="rounded-sm px-0 py-0 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 [&_p]:m-0"
                      />
                    </div>
                  ) : (
                    <BlockPreview block={block} />
                  )}
                </div>
                <div
                  onDragOver={onDragOverAt(idx + 1)}
                  onDrop={onDropAt(idx + 1)}
                  className={cn(
                    "h-2 rounded transition-colors",
                    overIndex === idx + 1 && "h-3 bg-primary/30",
                  )}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Inspector */}
      <div className="w-72 shrink-0 overflow-y-auto border-l border-border pl-4">
        {selected ? (
          <>
            <p className="text-xs font-medium mb-3">{paletteEntry(selected.type)?.label}</p>
            <BlockInspector block={selected} onUpdate={(data) => updateBlock(selected.id, data)} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {tr("Kliknij blok na płótnie, aby go skonfigurować.")}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Kolumny na płótnie.
 *
 * Każda kolumna jest osobnym celem upuszczenia — blok przeciągnięty z lewej
 * ląduje w tej, nad którą puszczono mysz. To jedyny sposób, żeby układ
 * budowało się tak, jak wygląda; wybieranie kolumny z listy w panelu byłoby
 * tłumaczeniem układu na słowa, zamiast pokazywania go.
 *
 * **Podgląd, nie WYSIWYG co do piksela.** Na płótnie kolumny są proporcjonalne,
 * ale bez marginesów i typografii wiadomości — to obraz układu, a jak wygląda
 * naprawdę, pokazuje wysyłka testowa.
 */
function ColumnsCanvas({
  block,
  selectedId,
  onSelect,
  onDropInto,
  onDeleteInner,
  onUpdateInner,
}: {
  block: ContentBlock;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDropInto: (colIndex: number, dt: DataTransfer) => void;
  onDeleteInner: (id: string) => void;
  onUpdateInner: (id: string, data: Record<string, string>) => void;
}) {
  const [overCol, setOverCol] = useState<number | null>(null);
  const cols = block.columns ?? [];
  const widths = columnWidths(cols.length || 1, block.data.ratio || "1:1");

  return (
    <div className="flex gap-2" style={{ minHeight: 64 }}>
      {cols.map((inner, i) => (
        <div
          key={i}
          style={{ width: `${widths[i]}%` }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOverCol(i);
          }}
          onDragLeave={() => setOverCol(null)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOverCol(null);
            onDropInto(i, e.dataTransfer);
          }}
          className={cn(
            "rounded-md border-2 border-dashed p-1.5 transition-colors space-y-1.5",
            overCol === i ? "border-primary bg-primary/5" : "border-border/60",
          )}
        >
          {inner.length === 0 ? (
            <p className="py-3 text-center text-[11px] text-muted-foreground">
              {tr("Upuść blok tutaj")}
            </p>
          ) : (
            inner.map((child) => (
              <div
                key={child.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(child.id);
                }}
                className={cn(
                  "group/inner relative rounded border p-1.5 cursor-pointer transition-colors",
                  selectedId === child.id
                    ? "border-primary ring-1 ring-primary"
                    : "border-transparent hover:border-border",
                )}
              >
                <button
                  type="button"
                  title={tr("Usuń z kolumny")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteInner(child.id);
                  }}
                  className="absolute right-1 top-1 z-10 h-5 w-5 rounded bg-background border border-border opacity-0 group-hover/inner:opacity-100 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
                {selectedId === child.id && inlineEditable(child) ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <RichTextEditor
                      value={inlineValue(child)}
                      onChange={(html) => onUpdateInner(child.id, inlinePatch(child, html))}
                      minHeight={32}
                      toolbar={false}
                      className="rounded-sm px-0 py-0 text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 [&_p]:m-0"
                    />
                  </div>
                ) : (
                  <BlockPreview block={child} />
                )}
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Dopasowanie liczby przegród po zmianie ustawienia „Liczba kolumn".
 *
 * **Zmniejszenie NIE kasuje treści.** Bloki z usuwanych kolumn przenoszą się do
 * ostatniej, która zostaje. Kasowanie ich byłoby cichą stratą pracy przy
 * kliknięciu, które wygląda na zmianę układu, a nie na usuwanie — a to jest
 * dokładnie ten rodzaj niespodzianki, po której nikt już nie ufa edytorowi.
 */
export function resizeColumns(
  block: ContentBlock,
  data: Record<string, string>,
): ContentBlock[][] | undefined {
  if (block.type !== "columns") return block.columns;
  const want = Number(data.count) || 2;
  const current = block.columns ?? [];
  if (current.length === want) return current;

  if (want > current.length) {
    return [...current, ...Array.from({ length: want - current.length }, () => [])];
  }
  const kept = current.slice(0, want);
  const orphaned = current.slice(want).flat();
  if (orphaned.length > 0) kept[want - 1] = [...kept[want - 1], ...orphaned];
  return kept;
}
