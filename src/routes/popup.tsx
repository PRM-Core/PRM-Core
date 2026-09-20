import { createFileRoute } from "@tanstack/react-router";
import { ContentSectionPage } from "@/components/content-builder/ContentSectionPage";
import { makeBlock } from "@/lib/content-builder";
import { popupSeedItems as seedItems } from "@/lib/content-seed";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/popup")({
  head: () => ({ meta: [{ title: t("Pop-Up — PRM Core") }] }),
  component: PopupPage,
});

function defaultPopupBlocks() {
  return [
    makeBlock("heading", { text: t("Tytuł pop-upu"), align: "center" }),
    makeBlock("text", { text: t("Krótki opis oferty…"), align: "center" }),
    makeBlock("button", { label: t("Kliknij tutaj"), align: "center" }),
  ];
}

function PopupPage() {
  return (
    <ContentSectionPage kind="popup" seedItems={seedItems} defaultBlocks={defaultPopupBlocks} />
  );
}
