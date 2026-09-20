import {
  CalendarPlus,
  MessageSquare,
  Tag,
  Users,
  ClipboardList,
  ListChecks,
  UserPlus,
  MailOpen,
  MousePointerClick,
  Globe,
  Pencil,
  Milestone,
  Filter,
  TrendingUp,
  Download,
  ShieldOff,
  Mail,
  MessageSquare as SmsIcon,
  Bell,
  Route,
  Trash2,
  Bot,
  CircleStop,
  Newspaper,
  AppWindow,
  type LucideIcon,
} from "lucide-react";
import type { BuilderKind } from "@/lib/content-builder";
import type { AutomationGraph, AutomationNode, DelayUnit } from "@/lib/automation-flow";
import { t, localized } from "@/lib/i18n";

export type NodeCategory = "trigger" | "condition" | "action" | "aiAgent";

export interface CatalogItem {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  fields?: CatalogField[];
  /**
   * Set when PRM Engine cannot actually run this step yet — the builder still
   * offers it, but the inspector says so plainly instead of letting someone
   * wait for a run that will never happen.
   */
  engineNote?: string;
  /**
   * Neutral note about HOW a working step behaves (delivery timing, expiry).
   * Deliberately separate from `engineNote`, which is a warning that the step
   * does nothing — a step that works must never wear the warning colours.
   */
  engineHint?: string;
}

export interface CatalogField {
  key: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "number"
    | "select"
    | "content-template"
    | "funnel"
    | "funnel-stage"
    /** Picks one of the configured SMS senders; empty means "the default one". */
    | "sms-sender"
    /**
     * Picks a field from the contact card — the built-in columns and whatever
     * the clinic added in Ustawienia → Tabele / Dane. Same idea as the segment
     * builder: the list comes from the card, so a field renamed there is
     * renamed here too, and nobody can type a name that does not exist.
     */
    | "contact-field";
  options?: string[];
  placeholder?: string;
  /** Used when type === "content-template" — which section's items to offer as "Szablon". */
  templateKind?: BuilderKind;
}

const NO_EVENT_SOURCE = () =>
  t(
    "Nic w systemie nie wysyła jeszcze tego zdarzenia — ten wyzwalacz nigdy nie uruchomi automatyzacji.",
  );

export const triggerCatalog: CatalogItem[] = localized(() => [
  {
    key: "contact_created",
    label: t("Nowy kontakt"),
    description: t("Pacjent trafił do bazy (formularz, lead z reklamy, import, ręcznie)"),
    icon: UserPlus,
    tone: "bg-emerald-100 text-emerald-700",
    fields: [
      {
        key: "source",
        label: t("Źródło zawiera"),
        type: "text",
        placeholder: t("np. Rejestracja — puste = dowolne źródło"),
      },
      {
        key: "campaign",
        label: t("Kampania zawiera"),
        type: "text",
        placeholder: t("np. kardio-q1 — puste = dowolna kampania"),
      },
      {
        key: "status",
        label: t("Status"),
        type: "select",
        options: ["dowolny", "lead", "active", "patient", "inactive"],
      },
    ],
    engineHint: t(
      "Filtry sprawdzane są w momencie powstania kontaktu, na jego własnych danych — bez dokładania osobnego warunku za wyzwalaczem. Puste pole znaczy „dowolne”. Status to ten nadany przy zapisie: rezerwacja online zakłada od razu „patient”, lead z reklamy „lead”.",
    ),
  },
  {
    key: "visit_scheduled",
    label: t("Rejestracja wizyty"),
    description: t("Pacjent umówił się na wizytę"),
    icon: CalendarPlus,
    tone: "bg-teal-100 text-teal-700",
    fields: [
      {
        key: "service",
        label: t("Nazwa usługi zawiera"),
        type: "text",
        placeholder: t("kardiolog — puste = dowolna wizyta"),
      },
    ],
    engineHint: t(
      "Zasilane rezerwacjami online ze strony placówki **oraz** synchronizacją z systemem rezerwacji, więc obejmuje też wizyty umówione telefonicznie.",
    ),
  },
  {
    key: "visit_completed",
    label: t("Wizyta się odbyła"),
    description: t("Konsultacja została zakończona"),
    icon: CalendarPlus,
    tone: "bg-emerald-100 text-emerald-700",
    fields: [
      {
        key: "service",
        label: t("Nazwa usługi zawiera"),
        type: "text",
        placeholder: t("kardiolog — puste = dowolna wizyta"),
      },
    ],
    engineHint: t(
      "Wyzwala się, gdy system rezerwacji oznaczy wizytę jako zakończoną. Sam fakt, że termin minął, nie wystarcza — wizyta sprzed miesięcy potrafi nadal figurować jako umówiona. To jest właściwy moment na ankietę po konsultacji.",
    ),
  },
  {
    key: "visit_no_show",
    label: t("Brak wizyty pacjenta"),
    description: t("Termin minął, a pacjent się nie zjawił"),
    icon: CalendarPlus,
    tone: "bg-amber-100 text-amber-700",
    fields: [
      {
        key: "service",
        label: t("Nazwa usługi zawiera"),
        type: "text",
        placeholder: t("kardiolog — puste = dowolna wizyta"),
      },
    ],
    engineHint: t(
      "Wizyta nadal figuruje jako umówiona, a od jej godziny minęły ponad 2 godziny — pacjent nie dotarł i nie odwołał. Odwołana wizyta ma własny wyzwalacz, więc tu trafiają wyłącznie nieobecności. Dobre miejsce na propozycję nowego terminu.",
    ),
  },
  {
    key: "visit_cancelled",
    label: t("Wizyta odwołana"),
    description: t("Termin odwołany w systemie rezerwacji"),
    icon: CalendarPlus,
    tone: "bg-rose-100 text-rose-700",
    fields: [
      {
        key: "service",
        label: t("Nazwa usługi zawiera"),
        type: "text",
        placeholder: t("kardiolog — puste = dowolna wizyta"),
      },
    ],
    engineHint: t(
      "Wyzwala się, gdy system rezerwacji oznaczy wizytę jako odwołaną albo gdy wizyta, którą mieliśmy zapisaną, przestaje wracać z jego API (część systemów po prostu kasuje termin). Uwaga: przełożenie wygląda wtedy tak samo (stary termin znika, pojawia się nowy), więc scenariusz pisz tak, żeby był sensowny w obu przypadkach.",
    ),
  },
  {
    key: "chat_message",
    label: t("Wiadomość od pacjenta"),
    description: t("Pacjent odpisał lub napisał do placówki (skrzynka omnichannel)"),
    icon: MessageSquare,
    tone: "bg-sky-100 text-sky-700",
    fields: [
      {
        key: "channel",
        label: t("Kanał"),
        type: "select",
        options: ["dowolny", "email", "sms", "form", "survey"],
      },
    ],
    engineHint: t(
      "Wyzwala się, gdy wiadomość trafi do skrzynki: odpowiedź SMS-em lub e-mailem, wypełniony formularz albo ankieta. Wysyłki wychodzące nie liczą się jako wiadomość od pacjenta.",
    ),
  },
  {
    key: "tag_added",
    label: t("Dodanie tagu"),
    description: t("Do pacjenta dodano określony tag"),
    icon: Tag,
    tone: "bg-violet-100 text-violet-700",
    fields: [{ key: "tag", label: t("Tag"), type: "text", placeholder: t("np. VIP") }],
  },
  {
    key: "segment_joined",
    label: t("Dodanie do segmentu"),
    description: t("Pacjent trafił do wybranego segmentu"),
    icon: Users,
    tone: "bg-indigo-100 text-indigo-700",
    fields: [
      {
        key: "segment",
        label: t("Segment"),
        type: "text",
        placeholder: t("np. Pacjenci kardiologii"),
      },
    ],
  },
  {
    key: "form_submitted",
    label: t("Wysłanie formularza"),
    description: t("Pacjent wypełnił formularz (np. z pop-upu na stronie)"),
    icon: ClipboardList,
    tone: "bg-emerald-100 text-emerald-700",
    fields: [
      {
        key: "form",
        label: t("Nazwa formularza zawiera"),
        type: "text",
        placeholder: t("np. test słuchu — puste = dowolny formularz"),
      },
    ],
    engineHint: t(
      "Nazwa formularza to pole „activity” z webhooka leadów albo źródło pop-upu (`data-prm-source`). Bez filtra wyzwalacz reaguje na KAŻDY wypełniony formularz — przy kilku formularzach na stronie to zwykle nie o to chodzi.",
    ),
  },
  {
    key: "survey_submitted",
    label: t("Wypełnienie ankiety"),
    description: t("Pacjent odpowiedział na ankietę w pop-upie"),
    icon: ListChecks,
    tone: "bg-emerald-100 text-emerald-700",
  },
  {
    key: "email_opened",
    label: t("Otwarcie e-maila"),
    description: t("Pacjent otworzył wiadomość e-mail"),
    icon: MailOpen,
    tone: "bg-orange-100 text-orange-700",
  },
  {
    key: "email_clicked",
    label: t("Kliknięcie w e-mailu"),
    description: t("Pacjent kliknął link w wiadomości"),
    icon: MousePointerClick,
    tone: "bg-orange-100 text-orange-700",
  },
  {
    key: "page_visited",
    label: t("Odwiedzenie strony"),
    description: t("Pacjent odwiedził wybraną podstronę"),
    icon: Globe,
    tone: "bg-cyan-100 text-cyan-700",
    fields: [
      {
        key: "url",
        label: t("Adres zawiera"),
        type: "text",
        placeholder: t("np. /cennik — puste = dowolna strona"),
      },
    ],
  },
  {
    key: "field_changed",
    label: t("Zmiana pola kontaktu"),
    description: t("Zmieniła się wartość pola w kartotece"),
    icon: Pencil,
    tone: "bg-slate-200 text-slate-700",
    fields: [
      {
        key: "field",
        label: t("Pole"),
        type: "select",
        // The same keys the engine writes with — see WRITABLE_FIELDS and the
        // tag/segment helpers in actions.server.ts.
        options: [
          "dowolne",
          "tags",
          "segments",
          "status",
          "firstName",
          "lastName",
          "email",
          "phone",
          "source",
          "medium",
          "campaign",
        ],
      },
    ],
    engineHint: t(
      "Wyzwala się, gdy pole naprawdę zmieni wartość — zapis tej samej wartości nie liczy się jako zmiana. Zmiany tagów i segmentów wyzwalają zarówno ten wyzwalacz, jak i swoje własne („Dodanie tagu”, „Dodanie do segmentu”).",
    ),
  },
  {
    key: "stage_changed",
    label: t("Zmiana etapu"),
    description: t("Pacjent przeszedł do innego etapu opieki"),
    icon: Milestone,
    tone: "bg-amber-100 text-amber-700",
  },
  {
    key: "points_changed",
    label: t("Zmiana punktacji"),
    description: t("Zmieniła się punktacja zaangażowania pacjenta"),
    icon: TrendingUp,
    tone: "bg-lime-100 text-lime-700",
    engineNote: NO_EVENT_SOURCE(),
  },
  {
    key: "asset_downloaded",
    label: t("Pobranie materiału"),
    description: t("Pacjent pobrał materiał edukacyjny"),
    icon: Download,
    tone: "bg-fuchsia-100 text-fuchsia-700",
    engineNote: NO_EVENT_SOURCE(),
  },
]);

export const conditionCatalog: CatalogItem[] = localized(() => [
  {
    key: "in_segment",
    label: t("Pacjent jest w segmencie"),
    description: t("Sprawdza przynależność do segmentu"),
    icon: Users,
    tone: "bg-violet-100 text-violet-700",
    fields: [
      { key: "segment", label: t("Segment"), type: "text", placeholder: t("np. Pacjenci 60+") },
    ],
  },
  {
    key: "has_tag",
    label: t("Pacjent ma tag"),
    description: t("Sprawdza czy kontakt ma dany tag"),
    icon: Tag,
    tone: "bg-violet-100 text-violet-700",
    fields: [{ key: "tag", label: t("Tag"), type: "text", placeholder: t("np. Cukrzyca") }],
  },
  {
    key: "field_value",
    label: t("Wartość pola kontaktu"),
    description: t("Porównuje wartość wybranego pola"),
    icon: Pencil,
    tone: "bg-violet-100 text-violet-700",
    fields: [
      { key: "field", label: t("Pole"), type: "contact-field" },
      {
        key: "operator",
        label: t("Warunek"),
        type: "select",
        options: ["równa się", "zawiera", "większe niż", "mniejsze niż"],
      },
      { key: "value", label: t("Wartość"), type: "text" },
    ],
  },
  {
    key: "email_opened_cond",
    label: t("E-mail otwarty"),
    description: t("Sprawdza czy poprzedni e-mail został otwarty"),
    icon: MailOpen,
    tone: "bg-violet-100 text-violet-700",
  },
  {
    key: "dnc_status",
    label: t("Status „nie kontaktować”"),
    description: t("Sprawdza zgody komunikacyjne pacjenta"),
    icon: ShieldOff,
    tone: "bg-violet-100 text-violet-700",
  },
]);

export const actionCatalog: CatalogItem[] = localized(() => [
  {
    key: "send_email",
    label: t("Wyślij e-mail"),
    description: t("Wysyła wiadomość e-mail do pacjenta"),
    icon: Mail,
    tone: "bg-orange-100 text-orange-700",
    fields: [
      { key: "template", label: t("Szablon"), type: "content-template", templateKind: "email" },
      {
        key: "subject",
        label: t("Temat"),
        type: "text",
        placeholder: t("np. Przypomnienie o jutrzejszej wizycie"),
      },
      {
        key: "sendMode",
        label: t("Tryb wysyłki"),
        type: "select",
        options: ["Marketingowy", "Administracyjny"],
      },
    ],
    engineHint: t(
      "Tryb **marketingowy** wysyła tylko do kontaktów ze zgodą na ten kanał — kampanie, newslettery, oferty. Tryb **administracyjny** pomija zgodę marketingową i służy wiadomościom niemarketingowym (przypomnienie o wizycie, zmiana terminu, wyniki). Tag „nie kontaktować” blokuje wysyłkę w obu trybach.",
    ),
  },
  {
    key: "send_newsletter",
    label: t("Wyślij newsletter"),
    description: t("Wysyła newsletter do pacjenta"),
    icon: Newspaper,
    tone: "bg-amber-100 text-amber-700",
    fields: [
      {
        key: "template",
        label: t("Szablon"),
        type: "content-template",
        templateKind: "newsletter",
      },
      {
        key: "sendMode",
        label: t("Tryb wysyłki"),
        type: "select",
        options: ["Marketingowy", "Administracyjny"],
      },
    ],
    engineHint: t(
      "Newsletter jest z definicji marketingiem — tryb administracyjny zostawiaj tylko na wyjątki, bo pomija zgodę pacjenta na ten kanał. Tag „nie kontaktować” blokuje wysyłkę w obu trybach.",
    ),
  },
  {
    key: "show_popup",
    label: t("Wyświetl pop-up"),
    description: t("Pokazuje pacjentowi okno pop-up na stronie www"),
    icon: AppWindow,
    tone: "bg-pink-100 text-pink-700",
    fields: [
      { key: "template", label: t("Szablon"), type: "content-template", templateKind: "popup" },
    ],
    engineHint: t(
      "Pop-up czeka w kolejce tego pacjenta i pokaże się przy jego najbliższej wizycie na stronie z kodem śledzącym. Rozpoznanie działa dla osób, które trafiły na stronę z linku w e-mailu. Kolejka wygasa po 30 dniach.",
    ),
  },
  {
    key: "send_sms",
    label: t("Wyślij SMS"),
    description: t("Wysyła wiadomość SMS do pacjenta"),
    icon: SmsIcon,
    tone: "bg-blue-100 text-blue-700",
    fields: [
      { key: "template", label: t("Szablon"), type: "content-template", templateKind: "sms" },
      { key: "sender", label: t("Nadawca"), type: "sms-sender" },
      {
        key: "sendMode",
        label: t("Tryb wysyłki"),
        type: "select",
        options: ["Marketingowy", "Administracyjny"],
      },
    ],
    engineHint: t(
      "Nadawca jest opcjonalny — puste pole oznacza domyślnego z Integracje → SMS API. Wybierz numer, jeśli pacjent ma mieć na co odpisać; nazwa alfanumeryczna jest jednokierunkowa. Tryb **marketingowy** wysyła tylko do kontaktów ze zgodą na ten kanał — kampanie, newslettery, oferty. Tryb **administracyjny** pomija zgodę marketingową i służy wiadomościom niemarketingowym (przypomnienie o wizycie, zmiana terminu, wyniki). Tag „nie kontaktować” blokuje wysyłkę w obu trybach.",
    ),
  },
  {
    key: "send_push",
    label: t("Wyślij powiadomienie push"),
    description: t("Powiadomienie w aplikacji mobilnej pacjenta"),
    icon: Bell,
    tone: "bg-rose-100 text-rose-700",
    fields: [{ key: "content", label: t("Treść powiadomienia"), type: "text" }],
    engineNote: t(
      "Symulacja — nie ma infrastruktury push. Silnik zapisze treść jako notatkę na karcie pacjenta zamiast wysyłać.",
    ),
  },
  {
    key: "change_tags",
    label: t("Dodaj / usuń tag"),
    description: t("Dodaje lub usuwa tag u pacjenta"),
    icon: Tag,
    tone: "bg-violet-100 text-violet-700",
    fields: [
      { key: "mode", label: t("Działanie"), type: "select", options: ["Dodaj", "Usuń"] },
      { key: "tag", label: t("Tag"), type: "text" },
    ],
  },
  {
    key: "change_segment",
    label: t("Dodaj / usuń z segmentu"),
    description: t("Dodaje lub usuwa pacjenta z segmentu"),
    icon: Users,
    tone: "bg-indigo-100 text-indigo-700",
    fields: [
      { key: "mode", label: t("Działanie"), type: "select", options: ["Dodaj", "Usuń"] },
      { key: "segment", label: t("Segment"), type: "text" },
    ],
  },
  {
    key: "update_field",
    label: t("Zaktualizuj pole kontaktu"),
    description: t("Ustawia wartość pola w kartotece"),
    icon: Pencil,
    tone: "bg-slate-200 text-slate-700",
    fields: [
      { key: "field", label: t("Pole"), type: "text" },
      { key: "value", label: t("Nowa wartość"), type: "text" },
    ],
  },
  {
    key: "change_points",
    label: t("Zmień punktację"),
    description: t("Zwiększa lub zmniejsza liczbę punktów"),
    icon: TrendingUp,
    tone: "bg-lime-100 text-lime-700",
    fields: [{ key: "points", label: t("Punkty (+/-)"), type: "number", placeholder: "10" }],
    engineNote: t("Punktacja nie istnieje jeszcze jako pole kontaktu — silnik pomija ten krok."),
  },
  {
    key: "change_stage",
    label: t("Zmień etap lejka"),
    description: t("Przenosi pacjenta do wybranego etapu lejka"),
    icon: Milestone,
    tone: "bg-amber-100 text-amber-700",
    // "funnelId" is a fixed key name — the "funnel-stage" field below always
    // reads config.funnelId to know which funnel's stages to list, so a
    // "funnel" field must always be keyed exactly "funnelId".
    fields: [
      { key: "funnelId", label: t("Lejek"), type: "funnel" },
      { key: "stageId", label: t("Etap"), type: "funnel-stage" },
    ],
  },
  {
    key: "assign_funnel",
    label: t("Przypisz do lejka"),
    description: t("Wprowadza pacjenta do lejka — np. po dodaniu tagu albo wejściu do segmentu"),
    icon: Filter,
    tone: "bg-amber-100 text-amber-700",
    // Same fixed key name as change_stage: the "funnel-stage" field type always
    // reads config.funnelId to know whose stages to list.
    fields: [
      { key: "funnelId", label: t("Lejek"), type: "funnel" },
      { key: "stageId", label: t("Etap startowy"), type: "funnel-stage" },
    ],
    engineHint: t(
      "Etap startowy jest opcjonalny — bez niego pacjent trafia na pierwszy etap lejka. Pacjent może być w jednym lejku naraz, więc przypisanie do innego przenosi go z poprzedniego. Kontakt, który już jest w tym lejku, zostaje na swoim etapie i krok jest pomijany.",
    ),
  },
  {
    key: "remove_from_funnel",
    label: t("Usuń z lejka"),
    description: t("Wypisuje pacjenta ze wszystkich lejków — wraca do stanu „bez lejka”"),
    icon: Filter,
    tone: "bg-slate-200 text-slate-700",
    engineHint: t(
      "Nie wyzwala „Zmiany etapu” — pacjent po wypisaniu nie stoi na żadnym etapie, więc scenariusze zbudowane na tym wyzwalaczu nie mają dla niego sensu.",
    ),
  },
  {
    key: "set_dnc",
    label: t("Oznacz „nie kontaktować”"),
    description: t("Ustawia status braku zgody na kontakt"),
    icon: ShieldOff,
    tone: "bg-rose-100 text-rose-700",
  },
  {
    key: "delete_contact",
    label: t("Usuń kontakt"),
    description: t("Trwale usuwa kartotekę pacjenta"),
    icon: Trash2,
    tone: "bg-rose-100 text-rose-700",
  },
  {
    key: "end_process",
    label: t("Koniec procesu"),
    description: t("Kończy ścieżkę — nie wykonuje żadnej akcji i nie można z niej prowadzić dalej"),
    icon: CircleStop,
    tone: "bg-slate-200 text-slate-700",
  },
]);

export const aiAgentCatalog: CatalogItem = localized(() => ({
  key: "ai_agent_router",
  label: t("Agent AI — inteligentny router"),
  description: t("Automatycznie analizuje kontakt i kieruje go do najlepszej ścieżki komunikacji"),
  icon: Bot,
  tone: "bg-fuchsia-100 text-fuchsia-700",
}));

export function findCatalogItem(category: NodeCategory, key: string): CatalogItem | undefined {
  if (category === "trigger") return triggerCatalog.find((c) => c.key === key);
  if (category === "condition") return conditionCatalog.find((c) => c.key === key);
  if (category === "action") return actionCatalog.find((c) => c.key === key);
  return undefined;
}

export function delayUnitLabel(unit?: DelayUnit): string {
  if (unit === "minutes") return "minut";
  if (unit === "hours") return "godzin";
  return "dni";
}

/**
 * What starts this automation, read from the graph itself.
 *
 * There used to be a free-text `trigger` column on the automation row, written
 * once at seed time and never again — so the list happily showed "Nowy kontakt"
 * next to a graph whose trigger was `segment_joined`. The graph is the only
 * thing the engine obeys, so it is the only thing the UI may quote. A trigger
 * with a filter says what it filters on, because "Dodanie tagu" and "Dodanie
 * tagu: kardiologia" are different automations to anyone reading the list.
 */
export function triggerLabel(graph: AutomationGraph | null | undefined): string {
  const node = graph?.nodes.find((n) => n.kind === "trigger");
  if (!node) return "—";

  const label = nodeTitle(node);
  const config = node.config ?? {};
  // Wszystkie filtry, nie pierwszy z brzegu: „Nowy kontakt” może filtrować
  // naraz po źródle, kampanii i statusie, a lista automatyzacji pokazywałaby
  // wtedy trzy różne rzeczy pod jedną nazwą.
  const detail = [
    "tag",
    "segment",
    "url",
    "field",
    "service",
    "channel",
    "source",
    "campaign",
    "status",
    "form",
  ]
    .map((k) => (config[k] ?? "").trim())
    .filter((v) => v && v !== "dowolne" && v !== "dowolny")
    .join(" · ");
  return detail ? `${label}: ${detail}` : label;
}

/**
 * Human-readable name of a step. Shared by the canvas node and the run
 * history so the same step never goes by two different names in the UI.
 */
export function nodeTitle(node: AutomationNode): string {
  switch (node.kind) {
    case "delay":
      return `Poczekaj ${node.amount} ${delayUnitLabel(node.unit)}`;
    case "aiAgent":
      return node.goal || "Agent AI";
    case "trigger":
      return findCatalogItem("trigger", node.key ?? "")?.label ?? node.key ?? "Wyzwalacz";
    case "condition":
      return findCatalogItem("condition", node.key ?? "")?.label ?? node.key ?? "Warunek";
    case "path":
      return node.config?.label || "Rozgałęzienie";
    case "split":
      return node.config?.label || "Split A/B";
    default:
      return findCatalogItem("action", node.key ?? "")?.label ?? node.key ?? "Akcja";
  }
}
