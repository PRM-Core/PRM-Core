import { getAiConfig } from "./settings.server";
import { priceCall, type AiImage, type AiMessage } from "./provider.server";
import { logStep } from "../engine/log.server";
import type { SliceOutcome, SliceSpec, SlicedImage } from "../media/slicer.server";
import { blockId, defaultBlockData, type BlockType, type ContentBlock } from "../content-builder";
import { renderContentItemToFragment } from "../content-builder-html";
import { opisPlacowki } from "../config.server";
import { t } from "@/lib/i18n";

/**
 * Studio kreacji: PRM_Agent dostaje grafikę od grafika i koduje z niej gotową
 * wiadomość (e-mail / newsletter) albo pop-up.
 *
 * **Dlaczego to nie jest „wytnij i wklej obrazka w e-mail".** Wiadomość będąca
 * jednym wielkim obrazkiem to klasyczny sygnał spamowy, jest nieczytelna przy
 * zablokowanych obrazach (Outlook domyślnie je blokuje) i niewidzialna dla
 * czytników ekranu. Dlatego agent ma polecenie ODTWORZYĆ treść z grafiki jako
 * żywy tekst HTML, a samą grafikę zostawić tam, gdzie jest niezastępowalna
 * (zdjęcie, ilustracja, bohater kampanii). To jest sedno dostarczalności.
 *
 * Rzemiosło zakodowane w prompcie systemowym niżej — tabele, MSO dla Outlooka,
 * tryb ciemny, mobile — to zestaw, który w ręcznym kodowaniu e-maili jest
 * standardem od lat; tu po prostu pilnuje go agent zamiast człowieka.
 */

export type CreativeKind = "email" | "newsletter" | "popup";

export interface CreativeTurn {
  role: "user" | "assistant";
  text: string;
}

export interface CreativeInput {
  kind: CreativeKind;
  /** Identyfikator grafiki w Media — potrzebny, żeby ją pociąć. */
  mediaId?: string | null;
  /** Kadry wycięte w poprzednich turach; przy poprawkach nie tniemy drugi raz. */
  existingSlices?: SlicedImage[];
  /** Wywoływane po zaplanowaniu kadrów; oddaje gotowe pliki. */
  onSlice?: (slices: SliceSpec[]) => Promise<SliceOutcome>;
  /** Grafika — doklejana do KAŻDEGO wywołania, żeby poprawki nie dryfowały od oryginału. */
  image: AiImage | null;
  /** Publiczny adres grafiki w Media — jedyny, jakiego wolno użyć w `src`. */
  imageUrl: string;
  /** Adres instancji, do sklejania pełnych adresów kadrów. */
  baseUrl: string;
  /** Polecenie użytkownika w tej turze. */
  instruction: string;
  /** Dotychczasowa rozmowa (sam tekst — HTML niesie `priorHtml`). */
  history: CreativeTurn[];
  /** Ostatnia wersja kodu, jeśli już jakaś jest — poprawki idą od niej, nie od zera. */
  priorHtml: string;
  /** Klocki z poprzedniej tury — poprawka układa je dalej, nie od zera. */
  priorBlocks?: ContentBlock[];
}

export interface CreativeResult {
  /** Klocki gotowe do wstawienia w edytor przeciągnij-i-upuść. */
  blocks: ContentBlock[];
  /** Podgląd wyrenderowany tym samym rendererem co wysyłka — do pokazania w studiu. */
  html: string;
  /** Kadry wycięte z projektu — wracają do widoku, żeby poprawki ich nie gubiły. */
  slices: SlicedImage[];
  /** Propozycje tytułów wiadomości (puste dla pop-upów). */
  subjects: string[];
  /** Preheader — tekst widoczny w skrzynce zaraz po tytule. */
  preheader: string;
  /** Co agent zrobił i dlaczego — do przeczytania, nie do kodu. */
  notes: string[];
  /** Rekomendacje zmian (kontrast, waga grafiki, wezwanie do działania…). */
  recommendations: string[];
  /** Krótka odpowiedź czatowa agenta. */
  reply: string;
  costUsd: number;
}

/**
 * Rzemiosło e-mailowe. Każda reguła poniżej odpowiada realnemu klientowi
 * pocztowemu, który bez niej psuje wiadomość — to nie jest lista życzeń.
 */
/**
 * Rzemiosło e-mailowe — oparte na budowie profesjonalnych newsletterów
 * (architektura klasy BeeFree/Stripo).
 *
 * Zmiana podejścia: zamiast listy zasad prompt niesie DOSŁOWNY SZKIELET
 * z gotowymi wzorcami bloków. Model wypełnia strukturę treścią, zamiast
 * wymyślać strukturę od zera — to jest różnica między „wie, że tabele"
 * a „koduje jak wzorzec".
 */
/**
 * Rzemiosło e-mailowe — wersja trzecia.
 *
 * **Uproszczona.** Wersja druga niosła architekturę wielokolumnową klasy
 * BeeFree i model gubił się w zagnieżdżeniach. Cel: prosta struktura,
 * dostosowana do desktopu i mobile, obrazek zakodowany jak strona.
 *
 * Stąd: **jedna kolumna, sekcja po sekcji, 600 px**. Wielokolumnowość zostaje
 * wyłącznie tam, gdzie projekt naprawdę ma dwie rzeczy obok siebie — i zawsze
 * z klasą `stack`, więc na telefonie i tak układa się pionowo.
 */
/**
 * Rzemiosło e-mailowe — wersja czwarta, po trzech nieudanych.
 *
 * **Zmiana fundamentalna: agent nie pisze już HTML-a.** Składa wiadomość
 * z KLOCKÓW istniejącego kreatora, a kod generuje sprawdzony renderer
 * (`content-builder-html.ts`) — ten sam, który tworzy e-maile wysyłane dziś
 * ręcznie. Trzy poprzednie podejścia poległy, bo model pisał kod: raz
 * amatorski, raz gubił się w zagnieżdżeniach, raz wstawiał wszędzie ten sam
 * obraz. Klocki znoszą całą tę klasę błędów — nie da się w nich napisać
 * zepsutej tabeli.
 *
 * **Efekt uboczny, który jest właściwie celem**: wynik otwiera się w edytorze
 * przeciągnij-i-upuść, więc placówka poprawia go sama, zamiast prosić agenta
 * o kolejną wersję.
 */
const EMAIL_CRAFT = () =>
  t(
    '\nNie piszesz HTML-a. Układasz wiadomość z KLOCKÓW, które system sam zamieni na kod.\n\nDOSTĘPNE KLOCKI (typ + pola „data"):\n- image      {url, alt, radius:"0", width:"600", href?}  ← kadr z projektu; radius:"0" ZAWSZE, żeby kadry stykały się bez zaokrągleń\n- heading    {text, align:"left|center|right", fontSize:"26", color:"#111111"}\n- text       {html:"<p>…</p>", align}                    ← akapity; w html wolno tylko <p> <br> <strong> <em> <a href>\n- button     {label, url, align, fontSize:"16"}\n- divider    {}\n- spacer     {height:"24"}\n- social     {facebook, instagram, linkedin}             ← tylko gdy projekt ma ikony społecznościowe\n\nZASADY UKŁADANIA:\n1. Idziesz przez projekt OD GÓRY DO DOŁU i zamieniasz każdą sekcję na klocki, w tej samej kolejności.\n2. Fotografie, zrzuty ekranu, ilustracje, logo → klocek "image" z adresem KADRU (dostajesz listę). Każdy kadr użyj najwyżej raz.\n3. Teksty czytelne z projektu (nagłówki, akapity, etykiety przycisków, dane w stopce) → klocki "heading", "text", "button" — jako ŻYWY TEKST, nigdy jako obraz.\n4. Sekcja, w której zdjęcie stoi OBOK tekstu: daj klocek "image", a pod nim "heading" i "text". Wiadomość jest jednokolumnowa — na telefonie i tak by się tak ułożyła, a tak wygląda identycznie wszędzie.\n5. Odstępy między sekcjami: "spacer" (24 px między sekcjami, 12 wewnątrz). Linie oddzielające: "divider".\n6. Kolory tekstu i rozmiary odczytaj z projektu i wpisz w pola. Nagłówek główny zwykle 26–30 px, śródtytuł 20–22, akapit 15–16, stopka 11.\n7. OSTATNI klocek to ZAWSZE "text" ze stopką: dane placówki i zdanie o wypisie.\n   Klocek "text" jest jedynym, który renderuje HTML — klocek "footer" ESCAPUJE go, więc link\n   wypisu wyszedłby w wiadomości jako goły napis. Stopkę składasz tak:\n   {"type":"text","data":{"align":"center","html":"<p style=\'font-size:11px;color:#6b7280;line-height:1.6\'>NAZWA · ADRES · TELEFON<br>Nie chcesz otrzymywać tych wiadomości? <a href=\'%%PRM_UNSUBSCRIBE%%\'>Wypisz się</a>.</p>"}}\n   Placeholder %%PRM_UNSUBSCRIBE%% dokładnie w tej postaci — wysyłka podmienia go na adres jednorazowy.\n8. Nie używaj klocków "html", "form", "survey", "personalization", "header", "footer".\n\nAdresy obrazów WYŁĄCZNIE z listy kadrów. Jeśli na jakąś sekcję kadru brakuje — pomiń obraz, zakoduj sekcję samym tekstem i napisz o tym w rekomendacjach. Nigdy nie wymyślaj adresu i nie powtarzaj tego samego kadru.',
  );

const POPUP_CRAFT = () =>
  t(
    '\nZASADY KODOWANIA POP-UPU:\n- To fragment HTML wstrzykiwany do gotowego okna na stronie placówki (system sam rysuje ramkę, tło okna i krzyżyk) — NIE koduj <html>/<head>/<body> ani własnego overlaya.\n- Style inline, nowoczesny CSS dozwolony (flexbox tak — to przeglądarka, nie klient pocztowy). Zero skryptów.\n- Responsywność: max-width:100%, obrazy width:100% height:auto, tekst czytelny na telefonie.\n- Odtwórz teksty z grafiki jako żywy tekst (dostępność, czytelność), grafika tylko tam, gdzie niezastępowalna.\n- Przycisk-łącze z wyraźnym wezwaniem do działania; jeśli użytkownik nie podał adresu docelowego, użyj href="#" i powiedz o tym w rekomendacjach.\n- Język polski.',
  );

/**
 * Przebieg pierwszy: co wyciąć z projektu.
 *
 * Osobne wywołanie, bo to inne zadanie niż kodowanie — tu model **patrzy
 * i mierzy**, tam **pisze kod**. Zlanie obu w jedno dawało kod, w którym model
 * deklarował zdjęcia, których nie miał, i wstawiał wszędzie adres całego
 * projektu.
 */
const PLAN_SYSTEM = () =>
  t(
    'Jesteś dyrektorem artystycznym przygotowującym projekt mailingu do zakodowania.\n\nDostajesz JEDEN plik z całym projektem. Twoim zadaniem jest wskazać, które fragmenty trzeba WYCIĄĆ jako osobne pliki graficzne, bo nie da się ich odtworzyć tekstem.\n\nWYCINAJ: fotografie, zrzuty ekranu, ilustracje, ikony, logo, elementy dekoracyjne o złożonej formie.\nNIE WYCINAJ: nagłówków, akapitów, etykiet przycisków, danych w stopce, jednolitych teł — to zostanie odtworzone jako żywy tekst.\n\nWspółrzędne podajesz jako UŁAMKI wymiarów obrazu (0–1), gdzie 0,0 to lewy górny róg:\n- left/top — położenie lewego górnego rogu kadru,\n- width/height — rozmiar kadru.\nKadr ma obejmować sam element z niewielkim marginesem, bez sąsiedniego tekstu.\n\nODPOWIADASZ WYŁĄCZNIE JSON-em:\n{\n  "slices": [\n    {"name": "krotka-nazwa-po-angielsku", "left": 0.0, "top": 0.0, "width": 1.0, "height": 0.22, "alt": "opis po polsku", "role": "hero|photo|screenshot|icon|logo|decor"}\n  ],\n  "sections": ["lista sekcji projektu od góry do dołu, po polsku — co po czym idzie"],\n  "palette": {"bg": "#ffffff", "text": "#111111", "accent": "#1e9bd7"}\n}\n\nKadrów ma być tyle, ile realnie potrzeba (zwykle 3–12). Nazwy bez polskich znaków i spacji.',
  );

function systemPrompt(kind: CreativeKind, imageUrl: string): string {
  const craft = kind === "popup" ? POPUP_CRAFT() : EMAIL_CRAFT();
  const what =
    kind === "popup"
      ? t("pop-up na stronę placówki")
      : t("wiadomość e-mail (kampania marketingowa placówki medycznej)");
  return t(
    'Jesteś PRM_Agentem — koderem kreacji w systemie PRM Core {v0}. Dostajesz grafikę przygotowaną przez grafika i kodujesz z niej {what}.\n\n{craft}\n\n{v3}\n\nODPOWIADASZ WYŁĄCZNIE JSON-em (bez markdownu, bez płotków):\n{\n  "reply": "krótko po polsku, co ułożyłeś",\n  "subjects": ["3–5 propozycji tytułów wiadomości"],\n  "preheader": "tekst preheadera, 40–90 znaków",\n  "blocks": [\n    {"type": "image", "data": {"url": "…", "alt": "…", "radius": "0", "width": "600"}},\n    {"type": "heading", "data": {"text": "…", "align": "center", "fontSize": "28", "color": "#111111"}}\n  ],\n  "notes": ["co zostało kadrem, a co żywym tekstem"],\n  "recommendations": ["czego brakuje, co warto poprawić"]\n}\n\nPrzy poprawkach modyfikuj OSTATNIĄ wersję kodu (dostaniesz ją), nie zaczynaj od zera — chyba że użytkownik prosi inaczej.',
    {
      v0: opisPlacowki(),
      what: what,
      craft: craft,
      v3: imageUrl
        ? t("PUBLICZNY ADRES GRAFIKI (jedyny, jakiego wolno użyć w src): {imageUrl}", {
            imageUrl: imageUrl,
          })
        : t(
            "OBRAZY: używaj WYŁĄCZNIE adresów z listy kadrów podanej w wiadomości. Nie masz żadnego innego adresu — jeśli na jakąś sekcję kadru brakuje, zakoduj ją samym tekstem i napisz o tym w rekomendacjach. NIGDY nie wymyślaj adresu ani nie powtarzaj tego samego pliku.",
          ),
    },
  );
}

/** Klocki, które studio ma prawo wystawić. Reszta typów nie ma tu zastosowania. */
const ALLOWED_BLOCKS: BlockType[] = [
  "image",
  "heading",
  "text",
  "button",
  "divider",
  "spacer",
  "social",
];

/**
 * Zamiana odpowiedzi modelu na klocki kreatora.
 *
 * **Nieznany typ jest pomijany, nie przepuszczany.** Edytor renderuje klocki po
 * typie; jeden wymyślony („columns", „hero") wywracałby całą kartę treści.
 * Pola nieznane danemu klockowi też odpadają — `defaultBlockData` wyznacza
 * kształt, a model dosypuje wartości.
 */
function toBlocks(raw: unknown): ContentBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: ContentBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = String((item as { type?: unknown }).type ?? "") as BlockType;
    if (!ALLOWED_BLOCKS.includes(type)) continue;
    const incoming = ((item as { data?: unknown }).data ?? {}) as Record<string, unknown>;
    const data = { ...defaultBlockData(type) };
    for (const key of Object.keys(data)) {
      const v = incoming[key];
      if (typeof v === "string" || typeof v === "number") data[key] = String(v);
    }
    out.push({ id: blockId("b"), type, data });
  }
  return out;
}

interface ParsedCreative {
  blocks: ContentBlock[];
  subjects: string[];
  preheader: string;
  notes: string[];
  recommendations: string[];
  reply: string;
}

function parseResult(text: string): ParsedCreative {
  let raw = text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) raw = fenced[1].trim();
  if (!raw.startsWith("{")) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const blocks = toBlocks(parsed.blocks);
  if (blocks.length === 0) throw new Error(t("Model nie zwrócił żadnych klocków."));
  return {
    blocks,
    subjects: Array.isArray(parsed.subjects) ? parsed.subjects.map(String) : [],
    preheader: typeof parsed.preheader === "string" ? parsed.preheader : "",
    notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map(String)
      : [],
    reply: typeof parsed.reply === "string" ? parsed.reply : "Gotowe.",
  };
}

/** Podgląd — tym samym rendererem, którym poleci wysyłka. */
function renderBlocks(blocks: ContentBlock[], kind: CreativeKind): string {
  return renderContentItemToFragment({
    id: "preview",
    kind: kind === "popup" ? "popup" : kind,
    name: "preview",
    source: "blocks",
    blocks,
    updatedAt: "",
    status: "draft",
  });
}

export async function generateCreative(input: CreativeInput): Promise<CreativeResult> {
  const config = await getAiConfig();
  let costUsd = 0;

  // ── przebieg 1: co wyciąć ────────────────────────────────────────────────
  //
  // Tylko przy pierwszym kodowaniu z nową grafiką. Poprawki dostają kadry
  // wycięte wcześniej — ponowne cięcie mnożyłoby pliki w Media i zmieniałoby
  // adresy pod już zakodowanymi obrazami.
  let slices: SlicedImage[] = input.existingSlices ?? [];
  let skippedSlices: { name: string; reason: string }[] = [];
  let plan = "";
  if (input.image && input.onSlice && slices.length === 0 && input.kind !== "popup") {
    const planCompletion = await config.provider.complete({
      model: config.model,
      system: PLAN_SYSTEM(),
      messages: [
        {
          role: "user",
          text: t("Wskaż kadry do wycięcia z tego projektu mailingu."),
          images: [input.image],
        },
      ],
      tools: [],
      // Sam plan to kilkanaście linijek JSON-a — duży limit byłby tu marnotrawstwem.
      maxTokens: 4000,
    });
    costUsd += priceCall(config.providerId, config.model, planCompletion.usage);

    try {
      let raw = planCompletion.text.trim();
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) raw = fenced[1].trim();
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      const parsed = JSON.parse(raw.slice(start, end + 1)) as {
        slices?: Array<SliceSpec & { alt?: string; role?: string }>;
        sections?: string[];
        palette?: Record<string, string>;
      };
      const specs = (parsed.slices ?? []).filter(
        (sp) => Number(sp.width) > 0 && Number(sp.height) > 0,
      );
      if (specs.length > 0) {
        const outcome = await input.onSlice(specs);
        slices = outcome.slices;
        skippedSlices = outcome.skipped;
      }
      // Plan wraca do drugiego przebiegu jako opis projektu: model ma
      // kolejność sekcji i paletę na piśmie, zamiast odczytywać je z obrazu
      // drugi raz i za drugim razem inaczej.
      plan =
        t("\n\nSEKCJE PROJEKTU (od góry):\n{v0}", {
          v0: (parsed.sections ?? []).map((x, i) => `${i + 1}. ${x}`).join("\n"),
        }) +
        (parsed.palette
          ? `\n\nPALETA: ${Object.entries(parsed.palette)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")}`
          : "");
    } catch {
      // Bez planu kodujemy dalej — po prostu bez kadrów. Lepszy e-mail
      // z samego tekstu niż zerwana operacja.
    }
  }

  // ── przebieg 2: kod ──────────────────────────────────────────────────────
  const messages: AiMessage[] = [];
  for (const turn of input.history) {
    messages.push({ role: turn.role, text: turn.text });
  }

  let text = input.instruction.trim() || t("Zakoduj wiadomość z załączonej grafiki.");
  if (slices.length > 0) {
    text +=
      t("\n\nDOSTĘPNE KADRY (używaj WYŁĄCZNIE tych adresów, każdy najwyżej raz):\n") +
      slices
        .map(
          (sl) =>
            `- ${sl.name}: ${input.baseUrl}${sl.publicPath} (${sl.pixelWidth}×${sl.pixelHeight} px)`,
        )
        .join("\n");
  }
  text += plan;
  if (input.priorBlocks && input.priorBlocks.length > 0) {
    // Do poprawki idą KLOCKI, nie HTML — kilkaset bajtów zamiast kilkudziesięciu
    // kilobajtów, a model modyfikuje dokładnie tę strukturę, którą sam ułożył.
    text +=
      t("\n\nOBECNY UKŁAD (zmodyfikuj go i oddaj CAŁY, w tym samym formacie):\n") +
      JSON.stringify(
        input.priorBlocks.map((b) => ({ type: b.type, data: b.data })),
        null,
        1,
      );
  }
  messages.push({
    role: "user",
    text,
    // Grafika przy każdym wywołaniu: poprawka „przesuń przycisk wyżej" ma być
    // robiona z oryginałem przed oczami, inaczej kolejne wersje dryfują od
    // projektu grafika.
    images: input.image ? [input.image] : undefined,
  });

  const completion = await config.provider.complete({
    model: config.model,
    // **Adres źródła znika, gdy mamy kadry.** Zostawiony w prompcie był furtką:
    // gdy jakiegoś kadru zabrakło, model wstawiał w to miejsce CAŁY projekt
    // i sekcja pokazywała powtórzony mailing.
    system: systemPrompt(input.kind, slices.length > 0 ? "" : input.imageUrl),
    messages,
    tools: [],
    // Uproszczony szkielet jest zwięzły, ale wiadomość z kilkunastoma sekcjami
    // nadal ma kilkadziesiąt kilobajtów; mniejszy limit ucinał w połowie tabeli.
    maxTokens: input.kind === "popup" ? 16000 : 32000,
  });

  costUsd += priceCall(config.providerId, config.model, completion.usage);
  await logStep({
    kind: "ai",
    message: t("Studio kreacji: {kind} — {v1}.", {
      kind: input.kind,
      v1: input.instruction.slice(0, 80) || t("kodowanie z grafiki"),
    }),
    detail: {
      feature: "creative-coder",
      kind: input.kind,
      kadrow: String(slices.length),
    },
    tokensIn: completion.usage.inputTokens,
    tokensOut: completion.usage.outputTokens,
    costUsd,
  });

  try {
    const parsed = parseResult(completion.text);
    const html = renderBlocks(parsed.blocks, input.kind);
    // Pominięte kadry trafiają do rekomendacji — użytkownik ma prawo wiedzieć,
    // że jakaś sekcja została bez zdjęcia, i dlaczego.
    const recommendations = [
      ...parsed.recommendations,
      ...skippedSlices.map((sk) =>
        t('Nie udało się wyciąć kadru „{name}" — {reason}. Ta sekcja jest bez zdjęcia.', {
          name: sk.name,
          reason: sk.reason,
        }),
      ),
    ];
    return { ...parsed, html, recommendations, slices, costUsd };
  } catch (err) {
    // Model odpowiedział nie-JSON-em (ucięty limit, dygresja). Zwracamy błąd
    // jako odpowiedź czatu zamiast wyjątku — użytkownik widzi, co się stało,
    // i może po prostu ponowić, nie tracąc rozmowy ani wyciętych kadrów.
    return {
      blocks: input.priorBlocks ?? [],
      html: input.priorHtml,
      slices,
      subjects: [],
      preheader: "",
      notes: [],
      recommendations: [],
      reply: t(
        "Nie udało się odczytać odpowiedzi modelu ({v0}). Spróbuj ponownie albo doprecyzuj polecenie.",
        { v0: err instanceof Error ? err.message : t("błąd") },
      ),
      costUsd,
    };
  }
}
