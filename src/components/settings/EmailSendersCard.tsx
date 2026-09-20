import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Mail, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  addEmailSender,
  getEmailSenders,
  makeDefaultEmailSender,
  removeEmailSender,
  type EmailSenderRow,
} from "@/lib/api/email-senders.functions";
import { t } from "@/lib/i18n";

/**
 * Nazwy nadawcy e-mail — kilka na ten sam adres.
 *
 * Pacjent widzi w skrzynce nazwę, nie adres, więc to ona decyduje, czy
 * wiadomość wygląda na tę samą rozmowę co poprzednia. Na przykład
 * „Klinika ABC" przy zaproszeniach i „Klinika" przy przypomnieniach —
 * z jednego adresu.
 */
export function EmailSendersCard() {
  const [rows, setRows] = useState<EmailSenderRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getEmailSenders()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useEffect(refresh, [refresh]);

  async function create() {
    setBusy(true);
    const r = await addEmailSender({ data: { name, email, note } });
    setBusy(false);
    if (!r.ok) {
      toast.error(t("Nie dodano nadawcy"), { description: r.error });
      return;
    }
    setName("");
    setEmail("");
    setNote("");
    setAdding(false);
    refresh();
  }

  async function remove(row: EmailSenderRow) {
    const r = await removeEmailSender({ data: { id: row.id } });
    if (!r.ok) {
      toast.error(t("Nie usunięto"), { description: r.error });
      return;
    }
    toast.success(t('Nadawca „{name}" usunięty.', { name: row.name }));
    refresh();
  }

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> {t(" Nazwy nadawcy")}
            </CardTitle>
            <CardDescription>
              {t(
                "Jeden adres, kilka podpisów. W skrzynce pacjenta widoczna jest nazwa, więc to ona decyduje, czy wiadomość wygląda na tę samą rozmowę co poprzednia.",
              )}
            </CardDescription>
          </div>
          {!adding && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> {t(" Dodaj nazwę")}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {adding && (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                autoFocus
                placeholder={t("Nazwa, np. Klinika ABC")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && void create()}
              />
              <Input
                placeholder={t("Adres (pusty = ten z SMTP)")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Input
              placeholder={t("Do czego służy — np. zaproszenia na badania")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {t(
                "Adres zostaw pusty, jeśli ma iść z tego samego, co dotąd. Własny adres musi być zweryfikowany w SendGridzie — inaczej wysyłka odbije się w całości.",
              )}
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={!name.trim() || busy} onClick={() => void create()}>
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}

                {t("Dodaj")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                {t("Anuluj")}
              </Button>
            </div>
          </div>
        )}

        {rows === null ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t("Nie ma jeszcze żadnej nazwy — wiadomości podpisują się tym, co ustawiono w SMTP.")}
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{row.name}</span>
                  {row.isDefault === 1 && (
                    <Badge variant="secondary" className="font-normal gap-1">
                      <Check className="h-3 w-3" /> {t(" domyślna")}
                    </Badge>
                  )}
                  {row.email && (
                    <Badge variant="outline" className="font-normal">
                      {row.email}
                    </Badge>
                  )}
                </div>
                {row.note && <p className="text-xs text-muted-foreground mt-0.5">{row.note}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {row.isDefault !== 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await makeDefaultEmailSender({ data: { id: row.id } });
                      refresh();
                    }}
                  >
                    {t("Ustaw domyślną")}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  title={t("Usuń")}
                  onClick={() => void remove(row)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
