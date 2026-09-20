import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Lock, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addStatus, getStatuses, removeStatus, updateStatus } from "@/lib/api/statuses.functions";
import type { ContactStatusRow } from "@/lib/db/schema";
import { t } from "@/lib/i18n";

/**
 * Statusy kontaktu — Ustawienia → Tabele / Dane.
 *
 * Cztery wbudowane da się przemianować i przebarwić, ale nie usunąć: filtry,
 * segmenty i wykresy odwołują się do nich po kluczu. Własne (np. „Lekarze")
 * usuwa się swobodnie, o ile żaden kontakt ich nie używa — serwer to sprawdza
 * i podaje liczbę, zamiast osierocić kartoteki.
 */

const PALETTE = [
  "oklch(0.78 0.14 85)",
  "oklch(0.58 0.18 250)",
  "oklch(0.68 0.16 165)",
  "oklch(0.72 0.02 250)",
  "oklch(0.62 0.17 300)",
  "oklch(0.66 0.15 30)",
  "oklch(0.60 0.14 200)",
];

export function StatusesCard({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<ContactStatusRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[4]);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("");

  const refresh = useCallback(() => {
    getStatuses()
      .then((r) => {
        setRows(r);
        onChanged?.();
      })
      .catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => refresh(), [refresh]);

  async function create() {
    setBusy("new");
    try {
      const r = await addStatus({ data: { label: newLabel, color: newColor } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setNewLabel("");
      setAdding(false);
      refresh();
      toast.success(t('Status „{newLabel}" dodany.', { newLabel: newLabel }));
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit(key: string) {
    setBusy(key);
    try {
      await updateStatus({ data: { key, label: editLabel, color: editColor } });
      setEditKey(null);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: ContactStatusRow) {
    setBusy(row.key);
    try {
      const r = await removeStatus({ data: { key: row.key } });
      if (!r.ok) {
        toast.error(r.error ?? t("Nie udało się usunąć."));
        return;
      }
      refresh();
      toast.success(t('Status „{label}" usunięty.', { label: row.label }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{t("Statusy kontaktu")}</CardTitle>
            <CardDescription>
              {t(
                "Etapy, na których bywa pacjent. Do statusów przypisujesz pola karty — inne dla leada, inne dla pacjenta.",
              )}
            </CardDescription>
          </div>
          {!adding && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> {t(" Dodaj status")}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {adding && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-3">
            <Input
              autoFocus
              placeholder={t("Nazwa, np. Lekarze")}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="max-w-[220px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLabel.trim()) void create();
              }}
            />
            <div className="flex items-center gap-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t("Kolor {c}", { c: c })}
                  className="h-6 w-6 rounded-full border-2"
                  style={{ background: c, borderColor: newColor === c ? "#111" : "transparent" }}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <Button
              size="sm"
              disabled={!newLabel.trim() || busy === "new"}
              onClick={() => void create()}
            >
              {busy === "new" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}

              {t("Dodaj")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              {t("Anuluj")}
            </Button>
          </div>
        )}

        {rows === null ? (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: row.color || "#999" }}
              />
              {editKey === row.key ? (
                <>
                  <Input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="max-w-[200px] h-8"
                  />
                  <div className="flex items-center gap-1">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={t("Kolor {c}", { c: c })}
                        className="h-5 w-5 rounded-full border-2"
                        style={{
                          background: c,
                          borderColor: editColor === c ? "#111" : "transparent",
                        }}
                        onClick={() => setEditColor(c)}
                      />
                    ))}
                  </div>
                  <Button size="sm" className="h-8 gap-1" onClick={() => void saveEdit(row.key)}>
                    <Check className="h-3.5 w-3.5" /> {t(" Zapisz")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => setEditKey(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium">{row.label}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {row.key}
                  </code>
                  {row.builtin === 1 && (
                    <Badge variant="outline" className="gap-1 font-normal text-[11px]">
                      <Lock className="h-3 w-3" /> {t(" wbudowany")}
                    </Badge>
                  )}
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => {
                      setEditKey(row.key);
                      setEditLabel(row.label);
                      setEditColor(row.color);
                    }}
                  >
                    {t("Zmień nazwę")}
                  </Button>
                  {row.builtin === 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-destructive"
                      disabled={busy === row.key}
                      onClick={() => void remove(row)}
                    >
                      {busy === row.key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>
          ))
        )}

        <p className="pt-1 text-xs text-muted-foreground">
          {t(
            "Klucz w nawiasie jest niezmienny — siedzi w kartotekach i w definicjach segmentów, więc jego zmiana osierociłaby jedno i drugie. Zmienia się nazwę, klucz zostaje.",
          )}
        </p>
      </CardContent>
    </Card>
  );
}
