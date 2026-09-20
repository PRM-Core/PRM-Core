import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PanelTop } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ContentSectionPage } from "@/components/content-builder/ContentSectionPage";
import { HeaderFooterDialog } from "@/components/content-builder/HeaderFooterDialog";
import {
  DEFAULT_BRAND,
  getBrandDefaults,
  saveBrandDefaults,
  type BrandDefaults,
} from "@/lib/api/brand.functions";
import { makeBlock } from "@/lib/content-builder";
import { emailSeedItems as seedItems } from "@/lib/content-seed";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/email")({
  head: () => ({ meta: [{ title: t("Email — PRM Core") }] }),
  component: EmailPage,
});

function EmailPage() {
  const [hf, setHf] = useState<BrandDefaults>(DEFAULT_BRAND);
  const [hfOpen, setHfOpen] = useState(false);

  // Nagłówek i stopka z BAZY: to dane placówki (logo, adres w stopce), a nie
  // ustawienie widoku. Trzymane w przeglądarce znaczyły, że kolega przy
  // sąsiednim biurku wysyła pacjentom stopkę przykładową.
  useEffect(() => {
    getBrandDefaults()
      .then(setHf)
      .catch(() => setHf(DEFAULT_BRAND));
  }, []);

  const saveHf = (next: BrandDefaults) => {
    setHf(next);
    void saveBrandDefaults({ data: next }).catch(() => {
      toast.error(t("Nie udało się zapisać nagłówka i stopki"), {
        description: t("Zmiana działa w tym oknie, ale nie zostanie zapamiętana."),
      });
    });
  };

  const defaultEmailBlocks = () => [
    makeBlock("header", {
      logoText: hf.logoText,
      tagline: hf.tagline,
      logoImageUrl: hf.logoImageUrl,
    }),
    makeBlock("heading"),
    makeBlock("text"),
    makeBlock("footer", { text: hf.footerText, imageUrl: hf.footerImageUrl, align: "center" }),
  ];

  return (
    <>
      <ContentSectionPage
        kind="email"
        seedItems={seedItems}
        defaultBlocks={defaultEmailBlocks}
        toolbarExtra={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHfOpen(true)}>
            <PanelTop className="h-4 w-4" /> {t(" Nagłówek i stopka")}
          </Button>
        }
      />
      <HeaderFooterDialog open={hfOpen} onOpenChange={setHfOpen} value={hf} onSave={saveHf} />
    </>
  );
}
