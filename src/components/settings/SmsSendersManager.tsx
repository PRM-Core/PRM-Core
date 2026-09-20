import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Star, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  getSmsSenders,
  createSmsSender,
  removeSmsSender,
  makeSmsSenderDefault,
  type SmsSenderView,
} from "@/lib/api/sms.functions";
import { t } from "@/lib/i18n";

/** Maximum length of a GSM alphanumeric sender ID. Carrier limit, not ours. */
const ALPHANUMERIC_MAX = 11;

/**
 * Checks a sender against the carrier rules before it reaches Twilio.
 *
 * These constraints come from the GSM standard and the operators, not from this
 * app — so failing them locally is strictly better than letting the send fail
 * hours later inside an automation with a cryptic Twilio error.
 */
function validateSender(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  if (/^[+0-9]/.test(v)) {
    const digits = v.replace(/[\s-]/g, "");
    if (!/^\+[1-9][0-9]{6,14}$/.test(digits)) {
      return t(
        "Numer musi być w formacie E.164: znak „+”, numer kierunkowy kraju i numer, np. +48221234567.",
      );
    }
    return null;
  }

  if (v.length > ALPHANUMERIC_MAX) {
    return t(
      "Nazwa alfanumeryczna może mieć maksymalnie {ALPHANUMERIC_MAX} znaków (ma {length}).",
      { ALPHANUMERIC_MAX: ALPHANUMERIC_MAX, length: v.length },
    );
  }
  if (!/^[A-Za-z0-9 ]+$/.test(v)) {
    return t(
      "Nazwa alfanumeryczna może zawierać tylko litery bez polskich znaków, cyfry i spacje.",
    );
  }
  if (!/[A-Za-z]/.test(v)) {
    return t(
      "Nazwa alfanumeryczna musi zawierać co najmniej jedną literę — sam ciąg cyfr operator potraktuje jako numer.",
    );
  }
  return null;
}

/**
 * Manages the list of SMS senders. Shared by Integracje → SMS API and the
 * "Nadawca" dialog in the SMS tab, so the two can never drift apart.
 *
 * The alphanumeric warning is the point of this screen as much as the list is:
 * a branded sender looks better and quietly makes replies impossible, and that
 * is not something anyone discovers on their own.
 */
export function SmsSendersManager({ onChanged }: { onChanged?: () => void }) {
  const [senders, setSenders] = useState<SmsSenderView[] | null>(null);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const rows = await getSmsSenders();
    setSenders(rows);
    onChanged?.();
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    if (!value.trim() || problem) return;
    setBusy(true);
    const result = await createSmsSender({ data: { label, value } });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? t("Nie udało się dodać nadawcy."));
      return;
    }
    setLabel("");
    setValue("");
    toast.success(t("Dodano nadawcę."));
    await refresh();
  };

  const handleDefault = async (id: string) => {
    await makeSmsSenderDefault({ data: { id } });
    toast.success(t("Ustawiono jako domyślnego."));
    await refresh();
  };

  const handleRemove = async (id: string) => {
    await removeSmsSender({ data: { id } });
    toast.success(t("Usunięto nadawcę."));
    await refresh();
  };

  const hasNumber = (senders ?? []).some((s) => s.kind === "number");
  const problem = validateSender(value);

  return (
    <div className="space-y-4">
      {senders === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : senders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("Brak nadawców — bez co najmniej jednego SMS-y nie wyjdą.")}
        </p>
      ) : (
        <div className="space-y-2">
          {senders.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{s.value}</span>
                  {s.isDefault && (
                    <Badge variant="secondary" className="font-normal text-[10px]">
                      {t("domyślny")}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={`font-normal text-[10px] ${
                      s.kind === "number"
                        ? "border-success/30 text-success"
                        : "border-[oklch(0.78_0.15_75)]/40 text-[oklch(0.48_0.15_75)]"
                    }`}
                  >
                    {s.kind === "number" ? "dwukierunkowy" : t("tylko wychodzący")}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </div>
              {!s.isDefault && (
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 shrink-0"
                  title={t("Ustaw jako domyślnego")}
                  onClick={() => void handleDefault(s.id)}
                >
                  <Star className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0 text-destructive"
                title={t("Usuń")}
                onClick={() => void handleRemove(s.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {senders !== null && senders.length > 0 && !hasNumber && (
        <div className="flex gap-2 rounded-lg border border-[oklch(0.78_0.15_75)]/40 bg-[oklch(0.78_0.15_75)]/10 p-3 text-xs text-[oklch(0.48_0.15_75)]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {t("Wszyscy nadawcy są alfanumeryczni, czyli ")} <b>{t("jednokierunkowi")}</b>{" "}
            {t(
              " — pacjent nie ma na co odpisać, a skrzynka omnichannel nie odbierze SMS-ów. Do rozmów potrzebny jest kupiony numer Twilio.",
            )}
          </span>
        </div>
      )}

      <div className="space-y-2 border-t border-border/60 pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Nadawca *")}</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("+48221234567 albo KlinikaABC")}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Opis")}</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("np. Kampanie / Recepcja")}
            />
          </div>
        </div>
        {/* Live feedback beats a rejected send: the rules below are carrier
            rules, and breaking them fails inside Twilio, not here. */}
        {problem ? (
          <p className="text-[11px] text-destructive">{problem}</p>
        ) : value.trim() ? (
          <p className="text-[11px] text-success">
            {t("Wygląda poprawnie — zostanie dodany jako")}{" "}
            {/^[+0-9]/.test(value.trim())
              ? t("numer (dwukierunkowy)")
              : t("nazwa (tylko wychodząca)")}
            .
          </p>
        ) : null}

        <div className="rounded-lg border border-border/60 bg-muted/40 p-3 space-y-2 text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground">{t("Wymagania operatorów")}</p>
          <div>
            <span className="font-medium text-foreground">{t("Nazwa alfanumeryczna")}</span>{" "}
            {t(" (np. „KlinikaABC”):")}
            <ul className="mt-0.5 ml-4 list-disc space-y-0.5">
              <li>
                {t("maksymalnie ")}{" "}
                <b>
                  {ALPHANUMERIC_MAX} {t(" znaków")}
                </b>
              </li>
              <li>
                {t("tylko litery bez polskich znaków, cyfry i spacje; co najmniej jedna litera")}
              </li>
              <li>
                <b>{t("jednokierunkowa")}</b>{" "}
                {t(" — pacjent nie odpisze, skrzynka nic nie odbierze")}
              </li>
              <li>{t("w Polsce wymaga wcześniejszej rejestracji u operatorów przez Twilio")}</li>
            </ul>
          </div>
          <div>
            <span className="font-medium text-foreground">{t("Numer")}</span>{" "}
            {t(" (np. +48221234567):")}
            <ul className="mt-0.5 ml-4 list-disc space-y-0.5">
              <li>
                {t("format ")} <b>{t("E.164")}</b>
                {t(": „+”, kod kraju, numer — bez spacji i nawiasów")}
              </li>
              <li>{t("musi być kupiony lub zweryfikowany na Waszym koncie Twilio")}</li>
              <li>
                <b>{t("dwukierunkowy")}</b> {t(" — tylko taki nadawca pozwala pacjentowi odpisać")}
              </li>
              <li>{t("numer polski wymaga uzupełnienia danych regulacyjnych (adres w PL)")}</li>
            </ul>
          </div>
          <p>
            {t("Osobno pamiętaj o długości ")} <b>{t("treści")}</b>
            {t(
              ": 160 znaków na jeden SMS, a przy polskich znakach diakrytycznych tylko 70 — licznik pokazuje to w edytorze SMS.",
            )}
          </p>
        </div>

        <Button
          size="sm"
          disabled={busy || !value.trim() || !!problem}
          onClick={() => void handleAdd()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <Plus className="h-4 w-4 mr-1.5" />
          )}

          {t("Dodaj nadawcę")}
        </Button>
      </div>
    </div>
  );
}
