import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContentSectionPage } from "@/components/content-builder/ContentSectionPage";
import { smsSeedItems as seedItems } from "@/lib/content-seed";
import { SmsSendersManager } from "@/components/settings/SmsSendersManager";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/sms")({
  head: () => ({ meta: [{ title: t("SMS — PRM Core") }] }),
  component: SmsPage,
});

function SmsPage() {
  const [senderOpen, setSenderOpen] = useState(false);

  return (
    <>
      <ContentSectionPage
        kind="sms"
        seedItems={seedItems}
        toolbarExtra={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setSenderOpen(true)}
          >
            <Smartphone className="h-4 w-4" /> {t(" Nadawcy")}
          </Button>
        }
      />

      <Dialog open={senderOpen} onOpenChange={setSenderOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("Nadawcy SMS")}</DialogTitle>
            <DialogDescription>
              {t(
                "Możesz mieć kilku nadawców naraz — np. nazwę marki do kampanii i numer do rozmów z pacjentami. Domyślny jest używany wszędzie tam, gdzie krok nie wskazuje innego. Dane logowania Twilio ustawia się osobno, w Integracje → Klucze i dane dostępowe.",
              )}
            </DialogDescription>
          </DialogHeader>
          <SmsSendersManager />
        </DialogContent>
      </Dialog>
    </>
  );
}
