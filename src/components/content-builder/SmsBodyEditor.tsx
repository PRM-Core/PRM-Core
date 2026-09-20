import { useRef } from "react";
import { Wand2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { PERSONALIZATION_FIELDS, mergeTagToken } from "@/lib/content-builder";
import { t } from "@/lib/i18n";

const SINGLE_SEGMENT_LIMIT = 160;

/** Plain-text SMS body editor — no block canvas, just a textarea with a personalization
 * toolbar (merge fields inserted as `{{field}}` tokens, resolved at test-send time — see
 * resolvePersonalizationInText) and a length/segment counter (SMS is billed and split per
 * 160 GSM-7 characters). */
export function SmsBodyEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const groups = [...new Set(PERSONALIZATION_FIELDS.map((f) => f.group))];
  const segments = Math.max(1, Math.ceil(value.length / SINGLE_SEGMENT_LIMIT));

  const insertAtCaret = (token: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      const caret = start + token.length;
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-1 rounded-md border border-input bg-muted/30 p-1 w-fit">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={t("Wstaw dane z karty kontaktu")}
              aria-label={t("Wstaw dane z karty kontaktu")}
            >
              <Wand2 className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            {groups.map((group) => (
              <div key={group}>
                <DropdownMenuLabel className="text-[11px]">{group}</DropdownMenuLabel>
                {PERSONALIZATION_FIELDS.filter((f) => f.group === group).map((f) => (
                  <DropdownMenuItem
                    key={f.value}
                    onSelect={() => insertAtCaret(mergeTagToken(f.value))}
                  >
                    {f.label}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={t("Wstaw skrót wypisania z listy")}
          aria-label={t("Wstaw skrót wypisania z listy")}
          onClick={() => insertAtCaret(mergeTagToken("unsubscribeLink"))}
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("np. Przypominamy o wizycie jutro o 10:00.")}
        className="flex-1 min-h-[220px] resize-none"
      />
      <p className="text-xs text-muted-foreground">
        {value.length} {t(" znaków · ")} {segments} {segments === 1 ? "SMS" : t("SMS-y")}{" "}
        {t(" (limit")} {SINGLE_SEGMENT_LIMIT} {t(" znaków na jeden SMS)")}
      </p>
    </div>
  );
}
