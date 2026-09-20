import { createFileRoute } from "@tanstack/react-router";
import { ContentSectionPage } from "@/components/content-builder/ContentSectionPage";
import { makeBlock } from "@/lib/content-builder";
import { newsletterSeedItems as seedItems } from "@/lib/content-seed";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/newsletter")({
  head: () => ({ meta: [{ title: t("Newslettery — PRM Core") }] }),
  component: NewsletterPage,
});

function defaultNewsletterBlocks() {
  return [makeBlock("header"), makeBlock("heading"), makeBlock("text"), makeBlock("footer")];
}

function NewsletterPage() {
  return (
    <ContentSectionPage
      kind="newsletter"
      seedItems={seedItems}
      defaultBlocks={defaultNewsletterBlocks}
    />
  );
}
