import { makeBlock, type BuilderKind, type ContentItem } from "@/lib/content-builder";
import { t, localized } from "@/lib/i18n";

export const newsletterSeedItems: ContentItem[] = localized(() => [
  {
    id: "nl-seed-1",
    kind: "newsletter",
    name: "Newsletter — Zdrowie serca (czerwiec 2026)",
    source: "blocks",
    status: "ready",
    updatedAt: "2026-06-02",
    blocks: [
      makeBlock("header"),
      makeBlock("heading", { text: t("Dbaj o swoje serce latem"), align: "left" }),
      makeBlock("text", {
        text: t(
          "Kilka porad kardiologicznych na nadchodzące miesiące — nawodnienie, aktywność fizyczna i regularne kontrole.",
        ),
        align: "left",
      }),
      makeBlock("button", {
        label: t("Umów wizytę"),
        url: "https://klinika-abc.pl/rejestracja",
        align: "center",
      }),
      makeBlock("social"),
      makeBlock("footer"),
    ],
  },
  {
    id: "nl-seed-2",
    kind: "newsletter",
    name: "Newsletter — Nowa poradnia dermatologiczna",
    source: "blocks",
    status: "draft",
    updatedAt: "2026-05-18",
    blocks: [
      makeBlock("header"),
      makeBlock("heading", { text: t("Otwieramy nową poradnię!"), align: "center" }),
    ],
  },
]);

// The three items below exist because the seeded automations reference them by
// name. A starter automation pointing at a template that was never shipped is
// how you get four "aktywna, ale nie ma czym wysłać" alerts on a fresh install
// — the supervisor was right, the seed was wrong.
export const emailSeedItems: ContentItem[] = localized(() => [
  {
    id: "em-seed-welcome",
    kind: "email",
    name: "Powitanie pacjenta",
    source: "blocks",
    status: "ready",
    updatedAt: "2026-05-20",
    blocks: [
      makeBlock("header"),
      makeBlock("heading", { text: t("Witamy w Klinice ABC"), align: "left" }),
      makeBlock("text", {
        text: t(
          "Dzień dobry, cieszymy się, że jest Pani/Pan z nami. Znajdziemy dla Państwa najlepszy termin i specjalistę — w razie pytań prosimy o kontakt z recepcją.",
        ),
        align: "left",
      }),
      makeBlock("button", {
        label: t("Umów wizytę"),
        url: "https://klinika-abc.pl/",
        align: "center",
      }),
      makeBlock("footer"),
    ],
  },
  {
    id: "em-seed-nps",
    kind: "email",
    name: "Ankieta NPS",
    source: "blocks",
    status: "ready",
    updatedAt: "2026-05-22",
    blocks: [
      makeBlock("header"),
      makeBlock("heading", { text: t("Jak oceniają Państwo swoją wizytę?"), align: "left" }),
      makeBlock("text", {
        text: t(
          "Prosimy o jedną minutę — Państwa opinia realnie wpływa na to, jak organizujemy opiekę.",
        ),
        align: "left",
      }),
      makeBlock("button", {
        label: t("Wypełnij krótką ankietę"),
        url: "https://klinika-abc.pl/",
        align: "center",
      }),
      makeBlock("footer"),
    ],
  },
  {
    id: "em-seed-edu",
    kind: "email",
    name: t("Materiały edukacyjne"),
    source: "blocks",
    status: "ready",
    updatedAt: "2026-05-23",
    blocks: [
      makeBlock("header"),
      makeBlock("heading", { text: t("Materiały przygotowane dla Państwa"), align: "left" }),
      makeBlock("text", {
        text: t(
          "Zebraliśmy najważniejsze informacje o profilaktyce kardiologicznej — badaniach kontrolnych, diecie i aktywności.",
        ),
        align: "left",
      }),
      makeBlock("button", {
        label: t("Przeczytaj poradnik"),
        url: "https://klinika-abc.pl/",
        align: "center",
      }),
      makeBlock("footer"),
    ],
  },
  {
    id: "em-seed-1",
    kind: "email",
    name: "Przypomnienie o wizycie",
    source: "blocks",
    status: "ready",
    updatedAt: "2026-05-24",
    blocks: [
      makeBlock("header"),
      makeBlock("heading", { text: t("Przypominamy o jutrzejszej wizycie"), align: "left" }),
      makeBlock("text", {
        text: t(
          "Dzień dobry, przypominamy o wizycie u kardiologa jutro o 10:00. W razie pytań prosimy o kontakt.",
        ),
        align: "left",
      }),
      makeBlock("button", {
        label: t("Zobacz szczegóły wizyty"),
        url: "https://klinika-abc.pl/",
        align: "center",
      }),
      makeBlock("footer"),
    ],
  },
]);

export const popupSeedItems: ContentItem[] = localized(() => [
  {
    id: "pu-seed-1",
    kind: "popup",
    name: t("Zapis do newslettera — rabat 10%"),
    source: "blocks",
    status: "ready",
    updatedAt: "2026-05-10",
    blocks: [
      makeBlock("heading", { text: t("Zapisz się i odbierz 10% rabatu"), align: "center" }),
      makeBlock("text", {
        text: t("Dołącz do newslettera Klinika ABC i otrzymaj rabat na pierwszą wizytę."),
        align: "center",
      }),
      makeBlock("button", {
        label: t("Zapisz mnie"),
        url: "https://klinika-abc.pl/newsletter",
        align: "center",
      }),
    ],
  },
]);

export const smsSeedItems: ContentItem[] = localized(() => [
  {
    id: "sms-seed-1",
    kind: "sms",
    name: "Przypomnienie o wizycie (SMS)",
    source: "blocks",
    status: "ready",
    updatedAt: "2026-07-27",
    blocks: [],
    smsBody: t("Przypominamy o wizycie jutro o 10:00 w Klinika ABC. W razie pytań: 22 000 00 00."),
  },
]);

const SEED_ITEMS_BY_KIND: Record<BuilderKind, ContentItem[]> = {
  newsletter: newsletterSeedItems,
  email: emailSeedItems,
  popup: popupSeedItems,
  sms: smsSeedItems,
};

function contentStorageKey(kind: BuilderKind): string {
  return `prm-content-${kind}`;
}

/**
 * **`getAllContentItems` i `getContentTemplateOptions` zostały usunięte
 *.**
 *
 * Czytały treści z `localStorage`, mimo że dziś mieszkają one
 * w bazie. Skutek: szablon utworzony na jednym komputerze nie istniał na
 * drugim — strona wysyłki odmawiała wysyłki („nie znaleziono szablonu w tej
 * przeglądarce"), węzeł automatyzacji nie widział go na liście, a agent
 * dostawał niepełny spis nazw.
 *
 * Zastępuje je `content/content-items.server.ts` po stronie serwera
 * i `getContentItems` / `getContentItemNames` po stronie interfejsu.
 * Funkcje nie wracają — **treść nie ma prawa mieszkać w przeglądarce**,
 * bo placówka pracuje na kilku komputerach i przeglądarkach naraz.
 *
 * Tablice powyżej zostają: są ziarnem wsiewanym RAZ do bazy na instalacji
 * demonstracyjnej (`seedContentItemsOnce`), a nie źródłem odczytu.
 */
