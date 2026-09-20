import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

/**
 * Names an automation. Used both when creating one and when renaming an
 * existing one from the list — same field, same validation, different words.
 */
export function CreateAutomationNameDialog({
  open,
  onOpenChange,
  onSubmit,
  initialName = "",
  title = t("Stwórz automatyzację"),
  description = t("Podaj nazwę, aby rozpocząć budowanie scenariusza."),
  submitLabel = t("Utwórz"),
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
  initialName?: string;
  title?: string;
  description?: string;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("Nazwa automatyzacji")}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("np. Przypomnienie o wizycie")}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Anuluj")}
          </Button>
          <Button disabled={!name.trim()} onClick={submit}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
