import { Button } from "@/components/ui/button";
import { makeBlock, UNSUBSCRIBE_PLACEHOLDER, type ContentBlock } from "@/lib/content-builder";
import { t, localized } from "@/lib/i18n";

/**
 * Zakładka „Sekcje" — gotowe układy kilku bloków naraz.
 *
 * **To nie są osobne rodzaje bloków, tylko przepis na kilka zwykłych.**
 * Sekcja wstawia dokładnie te bloki, które można potem pojedynczo edytować,
 * przestawiać i kasować — nic tu nie jest „zamknięte" ani niewidoczne dla
 * dotychczasowego edytora. Dzięki temu wiadomość zbudowana w Studiu otwiera
 * się bez zmian w module treści i odwrotnie.
 *
 * Teksty są po polsku i dotyczą placówki, bo sekcja ma oszczędzić pisanie,
 * a nie zostawić angielskie „Lorem ipsum" do podmiany w pięciu miejscach.
 */

interface SectionPreset {
  label: string;
  hint: string;
  build: () => ContentBlock[];
}

/** Kolumny z gotową zawartością — `makeBlock` tworzy puste przegrody. */
function columns(ratio: string, cols: ContentBlock[][]): ContentBlock {
  const block = makeBlock("columns", {
    count: String(cols.length),
    ratio,
    gap: "16",
  });
  block.columns = cols;
  return block;
}

const SECTIONS: SectionPreset[] = localized(() => [
  {
    label: t("Nagłówek z CTA"),
    hint: t("Logo, tytuł, akapit i przycisk"),
    build: () => [
      makeBlock("header", {
        logoText: "Klinika ABC",
        tagline: t("Zdrowie w dobrych rękach"),
        logoImageUrl: "",
      }),
      makeBlock("heading", {
        text: t("Zadbaj o siebie jeszcze w tym miesiącu"),
        align: "center",
        fontFamily: "",
        fontSize: "28",
        color: "",
      }),
      makeBlock("text", {
        html: t(
          "<p>Zapraszamy na konsultację w dogodnym terminie. Wystarczy jedno kliknięcie — resztą zajmiemy się my.</p>",
        ),
        align: "center",
      }),
      makeBlock("button", {
        label: t("Umów wizytę"),
        url: "https://",
        align: "center",
        fontFamily: "",
        fontSize: "",
      }),
    ],
  },
  {
    label: t("Trzy korzyści"),
    hint: t("Trzy kolumny z nagłówkiem i opisem"),
    build: () => [
      columns("1:1:1", [
        [
          makeBlock("heading", {
            text: "Bez kolejek",
            align: "center",
            fontFamily: "",
            fontSize: "18",
            color: "",
          }),
          makeBlock("text", {
            html: "<p>Terminy potwierdzamy tego samego dnia.</p>",
            align: "center",
          }),
        ],
        [
          makeBlock("heading", {
            text: "Jeden lekarz",
            align: "center",
            fontFamily: "",
            fontSize: "18",
            color: "",
          }),
          makeBlock("text", {
            html: t("<p>Prowadzi Cię ten sam specjalista od początku do końca.</p>"),
            align: "center",
          }),
        ],
        [
          makeBlock("heading", {
            text: "Wyniki online",
            align: "center",
            fontFamily: "",
            fontSize: "18",
            color: "",
          }),
          makeBlock("text", {
            html: t("<p>Badania odbierzesz bez wizyty w rejestracji.</p>"),
            align: "center",
          }),
        ],
      ]),
    ],
  },
  {
    label: t("Specjalista"),
    hint: t("Zdjęcie obok opisu, proporcja 1:2"),
    build: () => [
      columns("1:2", [
        [
          makeBlock("image", {
            url: "",
            alt: t("Zdjęcie specjalisty"),
            radius: "8",
            href: "",
            width: "",
          }),
        ],
        [
          makeBlock("heading", {
            text: t("dr n. med. Imię Nazwisko"),
            align: "left",
            fontFamily: "",
            fontSize: "20",
            color: "",
          }),
          makeBlock("text", {
            html: t(
              "<p>Specjalizacja i krótki opis doświadczenia. Przyjmuje w poniedziałki i środy.</p>",
            ),
            align: "left",
          }),
          makeBlock("button", {
            label: t("Zobacz terminy"),
            url: "https://",
            align: "left",
            fontFamily: "",
            fontSize: "",
          }),
        ],
      ]),
    ],
  },
  {
    label: t("Promocja"),
    hint: t("Wyróżniony nagłówek, warunki i przycisk"),
    build: () => [
      makeBlock("heading", {
        text: t("−15% na pakiet badań do końca miesiąca"),
        align: "center",
        fontFamily: "",
        fontSize: "24",
        color: "",
      }),
      makeBlock("text", {
        html: t(
          "<p>Promocja obejmuje morfologię, lipidogram i TSH. Obowiązuje przy rezerwacji online, do wyczerpania miejsc.</p>",
        ),
        align: "center",
      }),
      makeBlock("button", {
        label: t("Skorzystaj z promocji"),
        url: "https://",
        align: "center",
        fontFamily: "",
        fontSize: "",
      }),
      makeBlock("divider", {}),
    ],
  },
  {
    label: t("Materiały do pobrania"),
    hint: t("Nagłówek i blok załączników"),
    build: () => [
      makeBlock("heading", {
        text: t("Materiały do pobrania"),
        align: "left",
        fontFamily: "",
        fontSize: "20",
        color: "",
      }),
      makeBlock("attachments", { fileIds: "", title: t("Do pobrania"), align: "left" }),
    ],
  },
  {
    label: t("Stopka RODO"),
    hint: t("Odstęp, linia i stopka z wypisem"),
    build: () => [
      makeBlock("spacer", { height: "24" }),
      makeBlock("divider", {}),
      makeBlock("footer", {
        // Odnośnik wypisu jest w treści od razu: wiadomość marketingowa bez
        // niego to naruszenie, a najłatwiej go zapomnieć przy ostatnim bloku.
        text: t(
          'Otrzymujesz tę wiadomość, bo wyraziłeś zgodę na kontakt marketingowy. <a href="{UNSUBSCRIBE_PLACEHOLDER}">Wypisz się</a>.',
          { UNSUBSCRIBE_PLACEHOLDER: UNSUBSCRIBE_PLACEHOLDER },
        ),
        align: "center",
        imageUrl: "",
        fontFamily: "",
        fontSize: "12",
        color: "",
      }),
    ],
  },
]);

export function StudioSectionsPanel({ onInsert }: { onInsert: (blocks: ContentBlock[]) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        {t("Sekcja wstawia kilka zwykłych bloków — każdy da się potem osobno zmienić lub usunąć.")}
      </p>
      {SECTIONS.map((s) => (
        <Button
          key={s.label}
          variant="outline"
          className="h-auto w-full flex-col items-start gap-0.5 whitespace-normal px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50"
          onClick={() => onInsert(s.build())}
        >
          <span className="text-sm font-medium">{s.label}</span>
          <span className="text-[11px] font-normal text-muted-foreground">{s.hint}</span>
        </Button>
      ))}
    </div>
  );
}
