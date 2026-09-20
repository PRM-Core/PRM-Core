import { useState, useEffect } from "react";
import { useNavigate, useRouteContext, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Loader2, LogOut, Pencil, Smartphone } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { logoutUser, changePassword, changeName, changePhone } from "@/lib/api/auth.functions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { t } from "@/lib/i18n";
import { LanguageMenuItems } from "@/components/LanguageSwitcher";

export function AccountMenu() {
  const { user } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate();
  const router = useRouter();
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [changeNameOpen, setChangeNameOpen] = useState(false);
  const [changePhoneOpen, setChangePhoneOpen] = useState(false);

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : "?";
  const fullName = user ? `${user.firstName} ${user.lastName}` : t("Nie zalogowano");

  const handleLogout = async () => {
    await logoutUser();
    await router.invalidate();
    navigate({ to: "/login" });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="ml-1 h-9 w-9 rounded-full bg-primary-soft flex items-center justify-center text-xs font-semibold text-primary hover:ring-2 hover:ring-primary/30 transition-shadow shrink-0"
            aria-label={t("Menu konta")}
          >
            {initials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1 py-0.5">
              <span className="text-sm font-medium truncate">{fullName}</span>
              <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
              {user && (
                <Badge variant="secondary" className="w-fit font-normal mt-1">
                  {ROLE_LABELS[user.role]}
                </Badge>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setTimeout(() => setChangeNameOpen(true), 0);
            }}
            className="gap-2 cursor-pointer"
          >
            <Pencil className="h-4 w-4" /> {t(" Zmień nazwę")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setTimeout(() => setChangePhoneOpen(true), 0);
            }}
            className="gap-2 cursor-pointer"
          >
            <Smartphone className="h-4 w-4" />
            {user?.phone ? t("Zmień numer do weryfikacji") : t("Dodaj numer do weryfikacji")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setTimeout(() => setChangePwOpen(true), 0);
            }}
            className="gap-2 cursor-pointer"
          >
            <KeyRound className="h-4 w-4" /> {t(" Zmień hasło")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <LanguageMenuItems />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              handleLogout();
            }}
            className="gap-2 cursor-pointer text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" /> {t(" Wyloguj się")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangeNameDialog
        open={changeNameOpen}
        onOpenChange={setChangeNameOpen}
        currentFirstName={user?.firstName ?? ""}
        currentLastName={user?.lastName ?? ""}
      />
      <ChangePasswordDialog open={changePwOpen} onOpenChange={setChangePwOpen} />
      <ChangePhoneDialog
        open={changePhoneOpen}
        onOpenChange={setChangePhoneOpen}
        currentPhone={user?.phone ?? ""}
      />
    </>
  );
}

function ChangePhoneDialog({
  open,
  onOpenChange,
  currentPhone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhone: string;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(currentPhone);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPhone(currentPhone);
      setPassword("");
    }
  }, [open, currentPhone]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await changePhone({ data: { phone, currentPassword: password } });
      await router.invalidate();
      toast.success(
        phone.trim()
          ? t("Numer zapisany. Kody weryfikacyjne będą przychodzić na niego.")
          : t("Numer usunięty — weryfikacja SMS przestanie obowiązywać dla tego konta."),
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(t("Nie udało się zapisać numeru"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Numer do weryfikacji")}</DialogTitle>
          <DialogDescription>
            {t(
              "Na ten numer przychodzi kod przy logowaniu z nowego urządzenia. Bez numeru konto jest chronione wyłącznie hasłem.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("Numer telefonu")}</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+48 600 100 200"
              autoComplete="tel"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("Potwierdź hasłem")}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "Zmiana numeru zmienia drugi składnik logowania, dlatego wymaga hasła. Wszystkie urządzenia zapamiętane do tej pory będą musiały przejść weryfikację ponownie.",
              )}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("Anuluj")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || password.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}

            {t("Zapisz")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeNameDialog({
  open,
  onOpenChange,
  currentFirstName,
  currentLastName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFirstName: string;
  currentLastName: string;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(currentFirstName);
  const [lastName, setLastName] = useState(currentLastName);
  const [saving, setSaving] = useState(false);

  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await changeName({ data: { firstName: firstName.trim(), lastName: lastName.trim() } });
      await router.invalidate();
      toast.success(t("Nazwa konta została zaktualizowana"));
      onOpenChange(false);
    } catch (err) {
      toast.error(t("Nie udało się zmienić nazwy"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          setFirstName(currentFirstName);
          setLastName(currentLastName);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Zmień nazwę")}</DialogTitle>
          <DialogDescription>
            {t("Zaktualizuj imię i nazwisko wyświetlane w koncie.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Imię")}</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Nazwisko")}</Label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSave && handleSave()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("Anuluj")}
          </Button>
          <Button size="sm" disabled={!canSave} onClick={handleSave} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}

            {t("Zapisz")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSaving(false);
  };

  const canSave =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await changePassword({ data: { currentPassword, newPassword } });
      toast.success(t("Hasło zostało zmienione"));
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(t("Nie udało się zmienić hasła"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    } finally {
      setSaving(false);
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
        <DialogHeader>
          <DialogTitle>{t("Zmień hasło")}</DialogTitle>
          <DialogDescription>
            {t("Podaj aktualne hasło oraz nowe hasło (min. 8 znaków).")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Aktualne hasło")}</Label>
            <div className="relative">
              <Input
                type={showPasswords ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPasswords((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showPasswords ? t("Ukryj hasła") : t("Pokaż hasła")}
              >
                {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Nowe hasło")}</Label>
            <Input
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Powtórz nowe hasło")}</Label>
            <Input
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              onKeyDown={(e) => e.key === "Enter" && canSave && handleSave()}
            />
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-xs text-destructive">{t("Hasła nie są identyczne")}</p>
            )}
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-xs text-destructive">{t("Hasło musi mieć min. 8 znaków")}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("Anuluj")}
          </Button>
          <Button size="sm" disabled={!canSave} onClick={handleSave} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}

            {t("Zapisz")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
