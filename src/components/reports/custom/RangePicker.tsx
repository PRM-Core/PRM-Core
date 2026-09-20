import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReportRange } from "@/lib/reports/custom/catalog";
import { RANGE_PRESETS, resolveRange } from "@/lib/reports/custom/results";
import { shiftDay } from "@/lib/dashboard/activity";
import { warsawDay } from "@/lib/visits/warsaw-time";
import { t } from "@/lib/i18n";

/** Zakres dat raportu — wspólny dla wszystkich kafelków. */
export function RangePicker({
  value,
  onChange,
  idPrefix,
}: {
  value: ReportRange;
  onChange: (next: ReportRange) => void;
  idPrefix: string;
}) {
  const today = warsawDay(Date.now());
  const resolved = resolveRange(value, today);
  const error = "error" in resolved ? resolved.error : null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-preset`} className="text-xs text-muted-foreground">
          {t("Okres")}
        </Label>
        <Select
          value={value.preset}
          onValueChange={(v) => {
            const preset = v as ReportRange["preset"];
            if (preset !== "custom") return onChange({ preset, from: "", to: "" });
            // Własny zakres startuje od tego, co było widać — nie od pustych pól.
            const current = resolveRange(value, today);
            const start = "error" in current ? { from: shiftDay(today, -29), to: today } : current;
            onChange({ preset, ...start });
          }}
        >
          <SelectTrigger id={`${idPrefix}-preset`} className="h-9 w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {value.preset === "custom" && (
        <>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-from`} className="text-xs text-muted-foreground">
              {t("Od")}
            </Label>
            <Input
              id={`${idPrefix}-from`}
              type="date"
              className="h-9 w-[150px]"
              value={value.from}
              max={value.to || today}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-to`} className="text-xs text-muted-foreground">
              {t("Do")}
            </Label>
            <Input
              id={`${idPrefix}-to`}
              type="date"
              className="h-9 w-[150px]"
              value={value.to}
              min={value.from}
              max={today}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
            />
          </div>
        </>
      )}
      {error && (
        <p className="w-full text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
