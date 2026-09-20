import { useEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  Smartphone,
  Trash2,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listUsers,
  addUser,
  adminSetUserPhone,
  adminResetPassword,
  adminDeleteUser,
} from "@/lib/api/auth.functions";
import { ALL_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type UserRole } from "@/lib/auth/roles";
import type { SafeUser } from "@/lib/auth/session.server";
import { intlLocale, t } from "@/lib/i18n";

export function UsersTab() {
  const { user: me } = useRouteContext({ from: "__root__" });
  const [users, setUsers] = useState<SafeUser[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [phoneFor, setPhoneFor] = useState<SafeUser | null>(null);
  const [resetFor, setResetFor] = useState<SafeUser | null>(null);
  const [deleteFor, setDeleteFor] = useState<SafeUser | null>(null);
  const isAdmin = me?.role === "admin";

  const refresh = async () => {
    const list = await listUsers();
    setUsers(list);
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{t("Użytkownicy")}</CardTitle>
          {users && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {users.length} {users.length === 1 ? "konto" : "kont"} {t(" w workspace")}
            </p>
          )}
        </div>
        {isAdmin ? (
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> {t(" Dodaj użytkownika")}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />{" "}
            {t(" Tylko administrator może dodawać użytkowników")}
          </span>
        )}
      </CardHeader>
      <CardContent className="divide-y">
        {!users ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="h-9 w-9 rounded-full bg-primary-soft flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                {`${u.firstName[0]}${u.lastName[0]}`.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {u.firstName} {u.lastName}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {u.email}
                  {u.phone && ` · ${u.phone}`}
                </div>
              </div>
              {/* Konto bez numeru nie dostaje kodu SMS przy logowaniu, więc
                  chroni je samo hasło. To trzeba widzieć na liście, a nie
                  odkrywać przy okazji. */}
              {!u.phone && (
                <Badge
                  variant="outline"
                  className="font-normal shrink-0 border-warning/40 text-warning-foreground bg-warning/10"
                  title={t("Bez numeru telefonu weryfikacja SMS nie obowiązuje tego konta.")}
                >
                  {t("bez weryfikacji SMS")}
                </Badge>
              )}
              <Badge variant="secondary" className="font-normal shrink-0">
                {ROLE_LABELS[u.role]}
                {u.expiresAt && (
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {t("wygasa")}{" "}
                    {new Date(u.expiresAt).toLocaleString(intlLocale(), {
                      timeZone: "Europe/Warsaw",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                )}
              </Badge>
              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setPhoneFor(u)}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    {u.phone ? t("Zmień numer") : t("Dodaj numer")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setResetFor(u)}
                  >
                    <KeyRound className="h-3.5 w-3.5" /> {t(" Resetuj hasło")}
                  </Button>
                  {/* Własnego konta nie da się usunąć — serwer i tak odmówi. */}
                  {u.id !== me?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => setDeleteFor(u)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("Usuń")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>

      <AddUserDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => {
          refresh();
        }}
      />
      <EditPhoneDialog user={phoneFor} onClose={() => setPhoneFor(null)} onSaved={refresh} />
      <ResetPasswordDialog user={resetFor} onClose={() => setResetFor(null)} />
      <DeleteUserDialog user={deleteFor} onClose={() => setDeleteFor(null)} onDeleted={refresh} />
    </Card>
  );
}

function EditPhoneDialog({
  user,
  onClose,
  onSaved,
}: {
  user: SafeUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) setPhone(user.phone ?? "");
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await adminSetUserPhone({ data: { userId: user.id, phone } });
      toast.success(
        phone.trim()
          ? t("Numer zapisany. Kody weryfikacyjne pójdą na niego.")
          : t("Numer usunięty — to konto chroni już tylko hasło."),
      );
      onSaved();
      onClose();
    } catch (err) {
      toast.error(t("Nie udało się zapisać numeru"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Numer do weryfikacji")}</DialogTitle>
          <DialogDescription>
            {user ? `${user.firstName} ${user.lastName} · ${user.email}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{t("Numer telefonu")}</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+48 600 100 200"
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "Puste pole wyłącza weryfikację SMS dla tego konta. Zapamiętane urządzenia tej osoby będą musiały przejść weryfikację ponownie.",
            )}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("Anuluj")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}

            {t("Zapisz")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: SafeUser | null; onClose: () => void }) {
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (user) setTempPassword(null);
  }, [user]);

  const handleReset = async () => {
    if (!user) return;
    setWorking(true);
    try {
      const result = await adminResetPassword({ data: { userId: user.id } });
      setTempPassword(result.tempPassword);
    } catch (err) {
      toast.error(t("Nie udało się zresetować hasła"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Reset hasła")}</DialogTitle>
          <DialogDescription>
            {user ? `${user.firstName} ${user.lastName} · ${user.email}` : ""}
          </DialogDescription>
        </DialogHeader>

        {tempPassword ? (
          <div className="space-y-2">
            <Label>{t("Nowe hasło tymczasowe")}</Label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm select-all">
              {tempPassword}
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Zapisz je teraz — po zamknięciu okna nie da się go odczytać ponownie, bo w bazie leży wyłącznie skrót. Przekaż je inną drogą niż e-mail na to samo konto. Osoba ta została wylogowana ze wszystkich urządzeń.",
              )}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t(
              "Hasło zostanie zastąpione losowym, pokazanym raz. Wszystkie sesje tej osoby zostaną zakończone — reset zwykle znaczy, że konto mogło trafić w cudze ręce.",
            )}
          </p>
        )}

        <DialogFooter>
          {tempPassword ? (
            <Button onClick={onClose}>{t("Gotowe")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={working}>
                {t("Anuluj")}
              </Button>
              <Button variant="destructive" onClick={() => void handleReset()} disabled={working}>
                {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}

                {t("Resetuj hasło")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: SafeUser | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [working, setWorking] = useState(false);

  const handleDelete = async () => {
    if (!user) return;
    setWorking(true);
    try {
      await adminDeleteUser({ data: { userId: user.id } });
      toast.success(t("Konto {email} usunięte.", { email: user.email }));
      onDeleted();
      onClose();
    } catch (err) {
      toast.error(t("Nie udało się usunąć konta"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Usunąć konto?")}</DialogTitle>
          <DialogDescription>
            {user ? `${user.firstName} ${user.lastName} · ${user.email}` : ""}
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {t(
            "Ta osoba zostanie od razu wylogowana ze wszystkich urządzeń i nie zaloguje się ponownie. Tego nie da się cofnąć — żeby przywrócić dostęp, trzeba założyć konto od nowa. Dane pacjentów i historia pracy tej osoby zostają.",
          )}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={working}>
            {t("Anuluj")}
          </Button>
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={working}>
            {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("Usuń konto")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("marketing");
  /**
   * Termin ważności konta podglądu — domyślnie **jutro o 23:59**.
   *
   * Konto zakładane „na chwilę" bez terminu zostaje na zawsze, bo nikt do tego
   * nie wraca. Tu trzeba świadomie wydłużyć termin, a nie pamiętać o skasowaniu.
   */
  const [wygasa, setWygasa] = useState(() => {
    const d = new Date(Date.now() + 86_400_000);
    const p2 = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T23:59`;
  });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setRole("marketing");
    setSaving(false);
    setResult(null);
    setCopied(false);
  };

  const podglad = role === "reporter";
  const canSave =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    // Konto podglądu loguje się samym hasłem, więc numer telefonu nie jest do
    // niczego potrzebny — a audytor z zewnątrz zwykle go nie poda.
    (podglad || phone.trim().length > 0) &&
    (!podglad || !!wygasa) &&
    !saving;

  const handleCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await addUser({
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          role,
          expiresAt: podglad && wygasa ? new Date(wygasa).getTime() : null,
        },
      });
      setResult({ email: res.user.email, tempPassword: res.tempPassword });
      onCreated();
    } catch (err) {
      toast.error(t("Nie udało się dodać użytkownika"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    } finally {
      setSaving(false);
    }
  };

  const copyPassword = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.tempPassword);
      setCopied(true);
      toast.success(t("Skopiowano hasło"));
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("Nie udało się skopiować"));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("Dodaj użytkownika")}</DialogTitle>
              <DialogDescription>
                {t(
                  "Konto zostanie utworzone od razu, z tymczasowym hasłem do przekazania nowemu użytkownikowi.",
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("Imię *")}</Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("Nazwisko *")}</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Adres e-mail *")}</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jan.kowalski@przyklad.pl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {t("Numer telefonu ")} {podglad ? "(niepotrzebny)" : "*"}
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+48 600 000 000"
                  disabled={podglad}
                />
                {podglad && (
                  <p className="text-[11px] text-muted-foreground">
                    {t(
                      "Konto podglądu loguje się samym hasłem, więc numer nie jest do niczego potrzebny.",
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Rola / dostęp *")}</Label>
                <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
              </div>
              {podglad && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("Konto wygasa *")}</Label>
                  <Input
                    type="datetime-local"
                    value={wygasa}
                    onChange={(e) => setWygasa(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("Po tym terminie konto ")} <strong>{t("zniknie samo")}</strong>{" "}
                    {t(
                      " — razem z sesjami, więc otwarte okno przestanie działać natychmiast. Nie trzeba o nim pamiętać.",
                    )}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                {t("Anuluj")}
              </Button>
              <Button size="sm" disabled={!canSave} onClick={handleCreate} className="gap-1.5">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}

                {t("Dodaj użytkownika")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("Konto utworzone")}</DialogTitle>
              <DialogDescription>
                {t("Przekaż poniższe tymczasowe hasło użytkownikowi ")} <b>{result.email}</b>{" "}
                {t(" — powinien je zmienić po pierwszym logowaniu (Menu konta → Zmień hasło).")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5">
              <code className="flex-1 text-sm font-mono">{result.tempPassword}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={copyPassword}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <DialogFooter>
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                {t("Zamknij")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
