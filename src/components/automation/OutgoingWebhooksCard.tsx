import { useEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { KeyRound, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  deleteWebhookEndpointFn,
  getWebhookEndpoints,
  saveWebhookEndpointFn,
  type WebhookEndpointView,
} from "@/lib/api/webhooks.functions";
import { WEBHOOK_FIELDS } from "@/lib/webhooks/outgoing";
import { t, localized } from "@/lib/i18n";

// PRM Engine → where "send to a webhook" steps may post. Each destination is
// an administrator's decision about which patient data leaves and where to:
// the address (kept encrypted — a Zapier or Make hook URL is a secret in
// itself), the fields allowed out, and a signing secret shown exactly once.

const FIELD_LABELS: Record<string, string> = localized(() => ({
  firstName: t("imię"),
  lastName: t("nazwisko"),
  email: t("e-mail"),
  phone: t("numer telefonu"),
  status: t("status"),
  tags: t("tagi"),
  segments: t("segmenty"),
  source: t("źródło"),
  campaign: t("kampania"),
  createdAt: t("data dodania"),
}));

function FieldPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {WEBHOOK_FIELDS.map((f) => (
        <label key={f} className="flex items-center gap-1.5 text-xs">
          <Checkbox
            checked={value.includes(f)}
            onCheckedChange={(on) => onChange(on ? [...value, f] : value.filter((x) => x !== f))}
          />
          {FIELD_LABELS[f] ?? f}
        </label>
      ))}
    </div>
  );
}

export function OutgoingWebhooksCard() {
  const { user } = useRouteContext({ from: "__root__" });
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState<WebhookEndpointView[] | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);

  const load = () =>
    getWebhookEndpoints()
      .then(setItems)
      .catch(() => setItems([]));
  useEffect(() => {
    void load();
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      const r = await saveWebhookEndpointFn({ data: { name, url, fields } });
      if (r.secret) setSecret({ name, value: r.secret });
      setName("");
      setUrl("");
      setFields([]);
    });

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
          <Webhook className="h-5 w-5" />
        </div>
        <div>
          <CardTitle className="text-base">{t("Webhooki wychodzące")}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(
              "Dokąd krok „Wyślij do webhooka” może przekazać pacjenta — n8n, Make, Zapier albo własny system. Zawsze idzie numer PRM, pozostałe pola tylko zaznaczone tutaj; PESEL i pola własne nigdy. Odbiorca przetwarza dane pacjentów w imieniu placówki — potrzebna jest umowa powierzenia.",
            )}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {secret && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs space-y-1">
            <p className="font-medium">
              {t(
                "Sekret podpisu dla „{name}” — skopiuj go teraz, nie zostanie pokazany ponownie:",
                {
                  name: secret.name,
                },
              )}
            </p>
            <code className="block break-all rounded bg-background px-2 py-1">{secret.value}</code>
            <p className="text-muted-foreground">
              {t(
                "Odbiorca sprawdza nagłówek X-PRM-Signature: HMAC-SHA256 z „X-PRM-Timestamp.treść” tym sekretem — opis w docs/WEBHOOK-OUTGOING.md.",
              )}
            </p>
            <Button size="sm" variant="outline" onClick={() => setSecret(null)}>
              {t("Sekret zapisany")}
            </Button>
          </div>
        )}

        {items === null ? null : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Brak odbiorców.")}</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {items.map((w) => (
              <div key={w.id} className="p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{w.name}</span>
                  <span className="text-xs text-muted-foreground">{w.host}</span>
                  <span className="flex-1" />
                  {isAdmin && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const r = await saveWebhookEndpointFn({
                              data: {
                                id: w.id,
                                name: w.name,
                                fields: w.fields,
                                rotateSecret: true,
                              },
                            });
                            if (r.secret) setSecret({ name: w.name, value: r.secret });
                          })
                        }
                      >
                        <KeyRound className="h-3.5 w-3.5" /> {t("Nowy sekret")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await deleteWebhookEndpointFn({ data: { id: w.id } });
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
                {isAdmin ? (
                  <FieldPicker
                    value={w.fields}
                    onChange={(next) =>
                      run(async () => {
                        await saveWebhookEndpointFn({
                          data: { id: w.id, name: w.name, fields: next },
                        });
                      })
                    }
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("Pola: numer PRM{fields}.", {
                      fields:
                        w.fields.length > 0
                          ? `, ${w.fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}`
                          : "",
                    })}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <div className="rounded-lg border border-dashed p-3 space-y-3">
            <p className="text-sm font-medium">{t("Nowy odbiorca")}</p>
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label={t("Nazwa")}
                placeholder={t("Nazwa, np. n8n — rejestracja")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-56"
              />
              <Input
                aria-label={t("Adres")}
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 min-w-[240px]"
              />
            </div>
            <FieldPicker value={fields} onChange={setFields} />
            <Button
              size="sm"
              disabled={busy || !name.trim() || !url.trim()}
              onClick={() => void add()}
            >
              {t("Dodaj odbiorcę")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
