import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSmsSenders, type SmsSenderView } from "@/lib/api/sms.functions";
import { t } from "@/lib/i18n";

/** Radix forbids an empty item value, so "whatever is default" needs a sentinel. */
const DEFAULT_SENDER = "__default__";

/**
 * Picks which configured sender a send goes out from. Shared by the SMS test
 * dialogs so a test really goes out the way the campaign will — testing from
 * the default while the automation uses a different sender proves nothing.
 */
export function SmsSenderPicker({
  value,
  onChange,
  label = "Nadawca",
}: {
  /** Sender id, or "" for the default one. */
  value: string;
  onChange: (senderId: string) => void;
  label?: string;
}) {
  const [senders, setSenders] = useState<SmsSenderView[] | null>(null);

  useEffect(() => {
    getSmsSenders().then(setSenders);
  }, []);

  const chosen = senders?.find((s) => s.id === value);
  const effective = chosen ?? senders?.find((s) => s.isDefault) ?? null;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {!senders ? (
        <p className="text-xs text-muted-foreground">{t("Wczytywanie nadawców…")}</p>
      ) : senders.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("Brak nadawców — dodaj go w Integracje → SMS API, inaczej wysyłka zwróci błąd.")}
        </p>
      ) : (
        <>
          <Select
            value={value || DEFAULT_SENDER}
            onValueChange={(v) => onChange(v === DEFAULT_SENDER ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_SENDER}>
                {t("Domyślny")}
                {effective ? ` (${effective.value})` : ""}
              </SelectItem>
              {senders.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.value}
                  {s.label && s.label !== s.value ? ` — ${s.label}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {effective?.kind === "alphanumeric" && (
            <p className="text-[11px] text-[oklch(0.48_0.15_75)]">
              „{effective.value}
              {t(
                "” jest nadawcą alfanumerycznym — wiadomość dojdzie, ale odbiorca nie będzie mógł na nią odpisać.",
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
