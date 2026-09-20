import { useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Globe,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Star,
  Info,
  Link2,
  FileText,
  Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAllDomains,
  addDomain,
  deleteDomain,
  verifyDomain,
  setDefaultDomain,
  PLATFORM_CNAME_TARGET,
  type TrackedDomain,
  type DomainPurpose,
} from "@/lib/domains";
import { t, localized } from "@/lib/i18n";

const purposeLabel: Record<DomainPurpose, string> = localized(() => ({
  tracking: t("Linki i piksel trackingowy"),
  landing: "Strony docelowe / formularze",
  all: "Wszystko (tracking + strony)",
}));

const purposeIcon: Record<DomainPurpose, typeof Link2> = {
  tracking: Link2,
  landing: FileText,
  all: Globe,
};

function StatusBadge({ status }: { status: TrackedDomain["status"] }) {
  if (status === "verified") {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-success/10 text-success border-success/20 font-normal"
      >
        <ShieldCheck className="h-3 w-3" /> {t(" Zweryfikowana")}
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-destructive/10 text-destructive border-destructive/20 font-normal"
      >
        <ShieldAlert className="h-3 w-3" /> {t(" Błąd weryfikacji")}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 bg-warning/15 text-warning-foreground border-warning/30 font-normal"
    >
      <Clock className="h-3 w-3" /> {t(" Oczekuje na DNS")}
    </Badge>
  );
}

function CnameRow({ domain }: { domain: string }) {
  const [copied, setCopied] = useState(false);
  // Bez skonfigurowanego hosta nie ma czego kopiować — lepiej powiedzieć, czego
  // brakuje, niż podać rekord prowadzący donikąd.
  const record = PLATFORM_CNAME_TARGET
    ? `CNAME  ${domain}  →  ${PLATFORM_CNAME_TARGET}`
    : t("Ustaw VITE_PLATFORM_CNAME_TARGET, aby poznać docelowy rekord CNAME.");

  const copy = async () => {
    if (!PLATFORM_CNAME_TARGET) {
      toast.error(t("Brak VITE_PLATFORM_CNAME_TARGET w konfiguracji instalacji."));
      return;
    }
    try {
      await navigator.clipboard.writeText(`${domain} CNAME ${PLATFORM_CNAME_TARGET}`);
      setCopied(true);
      toast.success(t("Skopiowano rekord CNAME"));
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("Nie udało się skopiować"));
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
      <code className="flex-1 text-xs font-mono text-foreground/80 truncate">{record}</code>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

export function DomainTab() {
  const { user } = useRouteContext({ from: "__root__" });
  const isAdmin = user?.role === "admin";
  const [domains, setDomains] = useState<TrackedDomain[]>(() => getAllDomains());
  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newPurpose, setNewPurpose] = useState<DomainPurpose>("all");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrackedDomain | null>(null);

  const refresh = () => setDomains(getAllDomains());
  const activeDomain = domains.find((d) => d.isDefault) ?? domains[0];

  const handleAdd = () => {
    const trimmed = newDomain.trim().replace(/^https?:\/\//, "");
    if (!trimmed) return;
    addDomain(trimmed, newPurpose);
    refresh();
    setNewDomain("");
    setNewPurpose("all");
    setAddOpen(false);
    toast.success(t("Dodano domenę {trimmed}", { trimmed: trimmed }), {
      description: t("Dodaj rekord CNAME i kliknij „Sprawdź teraz”, żeby ją zweryfikować."),
    });
  };

  const handleVerify = (d: TrackedDomain) => {
    setVerifyingId(d.id);
    setTimeout(() => {
      const status = verifyDomain(d.id);
      refresh();
      setVerifyingId(null);
      if (status === "verified") {
        toast.success(t("Domena {domain} zweryfikowana", { domain: d.domain }), {
          description: t("SSL zostanie wystawiony automatycznie w ciągu kilku minut."),
        });
      } else {
        toast.error(t("Nie udało się zweryfikować {domain}", { domain: d.domain }), {
          description: PLATFORM_CNAME_TARGET
            ? t("Sprawdź, czy rekord CNAME wskazuje na ") + PLATFORM_CNAME_TARGET + "."
            : t("Brak VITE_PLATFORM_CNAME_TARGET w konfiguracji instalacji."),
        });
      }
    }, 1100);
  };

  const handleSetDefault = (d: TrackedDomain) => {
    setDefaultDomain(d.id);
    refresh();
    toast.success(t("{domain} ustawiona jako domena domyślna", { domain: d.domain }), {
      description: t("Nowe linki trackingowe i strony docelowe będą używać tego adresu."),
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteDomain(deleteTarget.id);
    setDeleteTarget(null);
    refresh();
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{t("Domena trackingowa")}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t(
                  "Zamiast domyślnego adresu PRM Core możesz podpiąć własną domenę pod linki trackingowe, piksel śledzący i strony docelowe.",
                )}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <span>
                {t("Linki w e-mailach wyglądają jak")}{" "}
                <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
                  {t("twojadomena.pl/l/…")}
                </code>
                {t(
                  ", nie jak domena PRM Core — lepsza wiarygodność i mniejsze ryzyko trafienia do spamu.",
                )}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <span>
                {t("Weryfikacja odbywa się przez rekord ")} <b>{t("CNAME")}</b>{" "}
                {t(
                  " w DNS — bez niego domena zostaje w stanie „Oczekuje”. Propagacja DNS może potrwać do 24–48h.",
                )}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <span>
                {t(
                  "Po weryfikacji certyfikat SSL wystawiany jest automatycznie — nie trzeba wgrywać własnego.",
                )}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("Aktywna domena")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {t("Używana teraz we wszystkich nowych linkach śledzących i na stronach docelowych.")}
            </p>
          </div>
          {activeDomain && (
            <Badge className="bg-primary text-primary-foreground font-mono text-xs">
              {activeDomain.domain}
            </Badge>
          )}
        </CardHeader>
      </Card>

      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">{t("Twoje domeny")}</CardTitle>
          {isAdmin ? (
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> {t(" Dodaj domenę")}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" />{" "}
              {t(" Zmiany domeny wymagają roli Administrator")}
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {domains.map((d) => {
            const PurposeIcon = purposeIcon[d.purpose];
            const isVerifying = verifyingId === d.id;
            return (
              <div key={d.id} className="rounded-lg border border-border/60 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0">
                    <PurposeIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 mr-auto">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium font-mono">{d.domain}</span>
                      {d.isDefault && (
                        <Badge variant="secondary" className="gap-1 font-normal text-[11px]">
                          <Star className="h-3 w-3" /> {t(" Domyślna")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {purposeLabel[d.purpose]} {t(" · dodano ")} {d.addedAt}
                    </p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>

                {d.status !== "verified" && <CnameRow domain={d.domain} />}

                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8 text-xs"
                      disabled={isVerifying}
                      onClick={() => handleVerify(d)}
                    >
                      {isVerifying ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      {d.status === "verified" ? t("Sprawdź ponownie") : t("Sprawdź teraz")}
                    </Button>
                    {d.status === "verified" && !d.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-8 text-xs"
                        onClick={() => handleSetDefault(d)}
                      >
                        <Star className="h-3.5 w-3.5" /> {t(" Ustaw jako domyślną")}
                      </Button>
                    )}
                    {!d.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive ml-auto"
                        onClick={() => setDeleteTarget(d)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t(" Usuń")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Dodaj domenę")}</DialogTitle>
            <DialogDescription>
              {t("Podaj (pod)domenę, którą chcesz podpiąć, np.")}{" "}
              <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
                {t("send.twojaklinika.pl")}
              </code>
              {t(". Po dodaniu zobaczysz rekord CNAME do wpisania w DNS.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Domena")}</Label>
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="send.twojaklinika.pl"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Przeznaczenie")}</Label>
              <Select value={newPurpose} onValueChange={(v) => setNewPurpose(v as DomainPurpose)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{purposeLabel.all}</SelectItem>
                  <SelectItem value="tracking">{purposeLabel.tracking}</SelectItem>
                  <SelectItem value="landing">{purposeLabel.landing}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              {t("Anuluj")}
            </Button>
            <Button size="sm" disabled={!newDomain.trim()} onClick={handleAdd} className="gap-1.5">
              <Send className="h-3.5 w-3.5" /> {t(" Dodaj domenę")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Usunąć domenę „")}
              {deleteTarget?.domain}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Linki wygenerowane wcześniej z tą domeną przestaną działać. Nowe linki będą używać domeny domyślnej.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Anuluj")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {t("Usuń domenę")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
