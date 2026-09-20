import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";
import type { UserRole } from "../auth/roles";
import type { AutomationGraph, AutomationStatus } from "../automation-flow";
import type { PopupConfig } from "../content-builder";
import type { SegmentDefinition } from "../segments/segment-definition";
import type { ReportDefinition } from "../reports/custom/catalog";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull().default(""),
  company: text("company").notNull(),
  role: text("role").notNull().default("admin").$type<UserRole>(),
  createdAt: text("created_at").notNull(),
  /**
   * Termin ważności konta — epoch ms. `null` = konto bezterminowe.
   *
   * Powstało dla kont podglądu zakładanych na czas audytu bezpieczeństwa.
   * **Konto tymczasowe, które trzeba pamiętać skasować, zostaje na zawsze** —
   * nikt do tego nie wraca, a po pół roku nie wiadomo już, czy jeszcze jest
   * potrzebne. Termin wpisany przy zakładaniu zdejmuje ten problem.
   *
   * Wygaśnięcie działa dwutorowo: logowanie odmawia natychmiast po terminie,
   * a silnik kasuje wiersz razem z sesjami przy najbliższym przebiegu. Sama
   * odmowa nie wystarcza — konto zostałoby w bazie i w spisie użytkowników.
   */
  expiresAt: integer("expires_at"),
  /**
   * Interface language chosen by the user: "en", "pl" or "" (not chosen yet —
   * the installation default, `PRM_LOCALE`, applies). Copied into the
   * `prm_locale` cookie at sign-in, so the choice follows the account to other
   * devices.
   */
  locale: text("locale").notNull().default(""),
});

/**
 * Sekret aplikacji uwierzytelniającej (Google Authenticator i pokrewne).
 *
 * **Wiersz powstaje przy rozpoczęciu konfiguracji, ale liczy się dopiero
 * `confirmedAt`.** Bez tego rozdziału ktoś, kto zeskanował kod QR i zamknął
 * okno bez przepisania kodu, zostałby z włączonym drugim składnikiem, którego
 * nie umie użyć — i przy następnym logowaniu nie wszedłby do systemu.
 *
 * Jeden sekret na użytkownika: druga aplikacja na tym samym koncie to nie jest
 * realna potrzeba, a każdy dodatkowy sekret to kolejne
 * miejsce, z którego można wygenerować kod.
 */
export const userTotp = sqliteTable("user_totp", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Sekret w base32 — dokładnie ten, który zobaczyła aplikacja w kodzie QR. */
  secret: text("secret").notNull(),
  /** Kiedy użytkownik potwierdził kodem, że aplikacja działa. `null` = konfiguracja niedokończona. */
  confirmedAt: integer("confirmed_at"),
  /** Ostatni użyty krok czasu — zapora przed powtórzeniem tego samego kodu. */
  lastUsedStep: integer("last_used_step"),
  createdAt: integer("created_at").notNull(),
});

/**
 * Kody zapasowe — jedyna droga do konta, gdy telefon przepadnie.
 *
 * **Trzymane jako skróty, nigdy jawnie.** Pokazujemy je raz, przy włączaniu
 * aplikacji; potem nikt — łącznie z administratorem i z nami — nie umie ich
 * odtworzyć. To jest cel: wykradziona baza nie daje wejścia na konta.
 *
 * Każdy kod działa **raz**. `usedAt` zostaje po zużyciu zamiast kasować wiersz,
 * żeby dało się odpowiedzieć na pytanie „czy ktoś użył kodu zapasowego i kiedy".
 */
export const totpRecoveryCodes = sqliteTable(
  "totp_recovery_codes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 kodu. Nigdy sam kod. */
    codeHash: text("code_hash").notNull(),
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_recovery_user").on(t.userId, t.usedAt)],
);

/**
 * Drobne ustawienia i znaczniki instalacji — klucz i wartość.
 *
 * Powstała dla znaczników typu „przykładowe treści zostały już wsiane".
 * Alternatywą było wnioskowanie ze stanu („czy tabela jest pusta"), ale to
 * daje zachowanie, w którym skasowanie wszystkiego przywraca przykłady —
 * czyli dokładnie ten błąd, dla którego naprawy ta tabela powstała.
 */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * Rezerwacje przyjęte, gdy webhook rezerwacji był **wstrzymany**.
 *
 * **Dlaczego odkładamy, a nie odrzucamy.** Placówka wstrzymuje odbiór na czas
 * porządków po swojej stronie. Odesłanie błędu zmusiłoby system rezerwacji do
 * ponawiania albo — gorzej — do porzucenia zgłoszenia; odesłanie „ok" bez zapisu
 * znaczyłoby ciche zgubienie rezerwacji pacjenta. Odłożenie surowej treści
 * pozwala potem **świadomie** zdecydować: przetworzyć zaległe albo je odrzucić.
 *
 * Trzymamy surowy payload, nie nasz przetworzony kształt: gdy zaległości będą
 * przetwarzane, ma je rozłożyć **aktualny** kod webhooka, a nie ten sprzed
 * kilku dni.
 */
export const parkedBookings = sqliteTable("ic_parked_bookings", {
  id: text("id").primaryKey(),
  receivedAt: integer("received_at").notNull(),
  payload: text("payload").notNull(),
  /** Ustawiane po przetworzeniu — wiersz zostaje jako ślad, nie znika. */
  processedAt: integer("processed_at"),
  /** Wynik przetworzenia: `ok`, `duplikat` albo treść odmowy. */
  result: text("result").notNull().default(""),
});

export type ParkedBookingRow = typeof parkedBookings.$inferSelect;

/**
 * Żądania zresetowania hasła — jednorazowe, krótkie, **trzymane jako skrót**.
 *
 * **Skrót, nie sam token.** Sesje trzymamy w postaci jawnej, bo ich wyciek
 * kończy się razem z ich ważnością; token resetu to co innego — pozwala
 * **przejąć konto**. Gdyby kopia bazy trafiła w cudze ręce, jawne tokeny byłyby
 * gotowym kluczem do każdego konta, które akurat prosiło o reset.
 *
 * `usedAt` zamiast kasowania wiersza: chcemy odróżnić „token zużyty" od „token
 * nigdy nie istniał", żeby ponowne kliknięcie w link z maila powiedziało
 * człowiekowi, co się stało, zamiast udawać, że link jest zmyślony.
 */
export const passwordResets = sqliteTable("password_resets", {
  /** SHA-256 tokenu z odnośnika. */
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

export type PasswordResetRow = typeof passwordResets.$inferSelect;

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
});

/**
 * Logowanie, które przeszło hasło, ale czeka na kod z SMS-a.
 *
 * Osobna tabela, a nie flaga na sesji, bo **sesja nie może jeszcze istnieć**:
 * gdyby powstawała po samym haśle, kod byłby ozdobą — wystarczyłoby zignorować
 * ekran z kodem i wejść na dowolny adres.
 *
 * Kod jest trzymany jako skrót, tak samo jak hasło. Kto podejrzy bazę, nie
 * zaloguje się cudzym kodem.
 */
export const loginChallenges = sqliteTable("login_challenges", {
  /** Losowy token wydany przeglądarce — sam w sobie nie wystarcza do wejścia. */
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** SHA-256 kodu. Nigdy sam kod. */
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  /** Nieudane próby. Po przekroczeniu limitu wyzwanie jest spalone. */
  attempts: integer("attempts").notNull().default(0),
  /** Ile razy wysłano kod dla tego wyzwania — hamulec na zasypywanie SMS-ami. */
  sends: integer("sends").notNull().default(1),
  /**
   * Kanał, którym poszedł kod: `sms` albo `email`.
   *
   * Zapisany, bo ponowne wysłanie ma iść **tym samym** kanałem co pierwsze —
   * inaczej człowiek czekający na SMS dostawałby raz SMS, raz e-mail i nie
   * wiedziałby, gdzie patrzeć.
   */
  channel: text("channel").notNull().default("sms"),
  createdAt: integer("created_at").notNull(),
});

/**
 * Urządzenie, które kod już przeszło.
 *
 * Dzięki temu weryfikacja pojawia się „co jakiś czas”, a nie przy każdym
 * logowaniu — inaczej ludzie zaczynają obchodzić zabezpieczenie, które im
 * przeszkadza, i to jest realne ryzyko, nie teoretyczne.
 */
export const trustedDevices = sqliteTable("trusted_devices", {
  /** SHA-256 tokenu z ciasteczka. Sam token żyje wyłącznie w przeglądarce. */
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const emailSettings = sqliteTable("email_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fromEmail: text("from_email").notNull().default(""),
  fromName: text("from_name").notNull().default(""),
  /**
   * Adres, na który trafiają **odpowiedzi** pacjentów.
   *
   * Osobny od nadawcy z rozmysłem. Nadawca buduje reputację domeny i zostaje
   * taki, jaki jest; odpowiedzi mają iść tam, gdzie ktoś je czyta — czyli na
   * adres wpięty w Inbound Parse, z którego wiadomość wpada do Skrzynki.
   * Pusty = klient pocztowy odpowie na adres nadawcy, czyli tak jak dotąd.
   */
  replyTo: text("reply_to").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

// Kept for future non-sender SMS settings; the sender itself moved to
// `sms_senders` later, because a clinic runs several at once (a
// branded alphanumeric ID for campaigns, a real number for conversations).
export const smsSettings = sqliteTable("sms_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  updatedAt: text("updated_at").notNull(),
});

/**
 * "alphanumeric" is a branded sender like "KlinikaABC". It looks better in a
 * patient's inbox but is **one-way by definition** — the phone has nothing to
 * reply to. "number" is a real Twilio number and is the only kind that can
 * carry a conversation, which is why the inbox prefers one.
 */
export type SmsSenderKind = "alphanumeric" | "number";

export const smsSenders = sqliteTable("sms_senders", {
  id: text("id").primaryKey(),
  /** What a human calls it in the picker — "Kampanie", "Recepcja". */
  label: text("label").notNull(),
  /** Exactly what goes into Twilio's `From`. Unique: two identical senders are one sender. */
  value: text("value").notNull().unique(),
  kind: text("kind").notNull().$type<SmsSenderKind>(),
  /** Used when nothing else is specified. Exactly one row carries it. */
  isDefault: integer("is_default").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

/**
 * Nazwy nadawcy e-mail — kilka na ten sam adres.
 *
 * **Po co.** Placówka wysyła z jednego adresu (`listonosz@klinika-abc.pl`),
 * ale pod różnymi nazwami: „Klinika ABC" przy zaproszeniach na badania,
 * „Klinika" przy przypomnieniach o wizycie. W skrzynce pacjenta widoczna jest
 * właśnie nazwa, więc to ona decyduje, czy wiadomość wygląda na tę samą
 * rozmowę, co poprzednia.
 *
 * Ta sama konstrukcja co `sms_senders`, z tego samego powodu: jeden adres
 * w ustawieniach nie opisywał rzeczywistości, w której jedna placówka prowadzi
 * kilka rodzajów korespondencji.
 *
 * **Adres pozostaje w `email_settings`** — tam jest zweryfikowany w SendGridzie
 * i zmiana adresu to zupełnie inna operacja niż zmiana podpisu.
 */
export const emailSenders = sqliteTable("email_senders", {
  id: text("id").primaryKey(),
  /** Nazwa widoczna w skrzynce odbiorcy. */
  name: text("name").notNull(),
  /** Adres, spod którego idzie. Pusty = adres z `email_settings`. */
  email: text("email").notNull().default(""),
  /** Do czego służy — podpowiedź przy wyborze, nie logika. */
  note: text("note").notNull().default(""),
  /** Używana, gdy wiadomość nie wskazuje własnej. Dokładnie jeden wiersz. */
  isDefault: integer("is_default").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export type EmailSenderRow = typeof emailSenders.$inferSelect;

/**
 * Połączenie z Meta (Facebook Lead Ads) — jedna strona na wiersz.
 *
 * **Po co, skoro webhook leadów już działa.** Dotąd leady szły przez Zapiera:
 * Meta → Zapier → nasz `/api/webhooks/leads`. Działa, ale placówka płaci za
 * każde zadanie, a lead dociera z opóźnieniem. Tu Meta woła nas wprost.
 *
 * **Token strony jest długożyciowy i nie wygasa sam** (o ile użytkownik nie
 * zmieni hasła i nie cofnie uprawnień aplikacji), dlatego trzymamy go w bazie,
 * a nie w `.env`: jest **per strona**, a placówka może mieć ich kilka, i może
 * je podłączać oraz odłączać bez wdrożenia. Identyfikator i sekret samej
 * aplikacji zostają w `.env` — to sekrety instalacji, nie danej strony.
 *
 * `lastLeadAt` i `lastErrorAt` są tu po to, żeby ekran integracji mógł
 * odpowiedzieć na jedyne pytanie, które naprawdę się liczy: **czy z tej strony
 * cokolwiek do nas dociera**. Sama deklaracja „podłączone" tego nie mówi —
 * ta sama lekcja co przy domenach śledzących.
 */
/**
 * Połączenie z Canvą — **jedno na instalację**.
 *
 * Projekty Canvy należą do konta, nie do placówki, więc łączy je jedna osoba
 * i wszyscy korzystają z tego samego dostępu. Dlatego stały klucz `id`, a nie
 * wiersz na użytkownika: inaczej import działałby tylko temu, kto akurat
 * kliknął „Połącz", a reszta widziałaby pustą listę bez wyjaśnienia.
 *
 * **Tokeny nigdy nie trafiają do interfejsu ani do dziennika.** Na zewnątrz
 * wychodzi wyłącznie nazwa konta — tyle, ile trzeba, żeby wiedzieć, czyje
 * projekty się widzi.
 */
export const canvaConnections = sqliteTable("canva_connections", {
  /** Zawsze "default" — jedno połączenie na instalację. */
  id: text("id").primaryKey(),
  /** Nazwa konta w Canvie, do pokazania na karcie integracji. */
  accountName: text("account_name").notNull().default(""),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull().default(""),
  /** Kiedy wygasa token dostępu (epoch ms). Odświeżamy z zapasem. */
  expiresAt: integer("expires_at").notNull().default(0),
  /** Zakresy, które faktycznie przyznano — bywają węższe, niż prosiliśmy. */
  scopes: text("scopes").notNull().default(""),
  connectedAt: integer("connected_at").notNull(),
  /** Ostatni błąd odświeżania albo pobierania — pokazywany wprost. */
  lastError: text("last_error"),
  lastErrorAt: integer("last_error_at"),
});

export type CanvaConnectionRow = typeof canvaConnections.$inferSelect;

export const metaConnections = sqliteTable("meta_connections", {
  /** ID strony na Facebooku — klucz naturalny, jedna strona jedno połączenie. */
  pageId: text("page_id").primaryKey(),
  pageName: text("page_name").notNull().default(""),
  /** Token strony. Nigdy nie pokazywany w interfejsie ani nie logowany. */
  pageAccessToken: text("page_access_token").notNull(),
  /** Czy strona jest zapisana na pole `leadgen` w naszej aplikacji. */
  subscribed: integer("subscribed").notNull().default(0),
  /** Kiedy ostatnio przyszedł stamtąd lead — dowód, że kanał żyje. */
  lastLeadAt: integer("last_lead_at"),
  /** Ostatni błąd pobierania, z czasem — do pokazania wprost, nie do przemilczenia. */
  lastError: text("last_error"),
  lastErrorAt: integer("last_error_at"),
  /** Dokąd doszło ostatnie dopytanie zaległości (epoch ms). */
  backfilledTo: integer("backfilled_to"),
  /**
   * Tagi dopisywane leadom z tej strony, po przecinku.
   *
   * **Per strona, nie globalnie**: placówka prowadzi kampanie na kilka
   * specjalizacji i „kardiologia" na leadzie z laryngologii byłaby nieprawdą,
   * na której buduje się segmenty. Puste = bez tagów.
   */
  leadTags: text("lead_tags").notNull().default("meta-lead"),
  /** Status nadawany leadom z tej strony. Puste = bez statusu. */
  leadStatus: text("lead_status").notNull().default("lead"),
  connectedAt: integer("connected_at").notNull(),
});

export type MetaConnectionRow = typeof metaConnections.$inferSelect;

export const leadWebhookSettings = sqliteTable("lead_webhook_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  secret: text("secret").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Treści kreatora: pop-upy, newslettery, e-maile i SMS-y.
 *
 * **Przeniesione z `localStorage` do bazy.** Wcześniej mieszkały
 * w przeglądarce, co znaczyło, że pop-up utworzony w Arc nie istniał w Safari,
 * na drugim komputerze ani u drugiej osoby w placówce — a wyczyszczenie danych
 * przeglądarki kasowało całą pracę bez śladu.
 *
 * `blocks`, `fileNames` i `popupConfig` zostają JSON-em, bo są strukturą
 * kreatora, a nie czymś, po czym kiedykolwiek będziemy filtrować w SQL-u —
 * ta sama decyzja co przy `stages` na lejkach.
 */
export const contentItems = sqliteTable(
  "content_items",
  {
    id: text("id").primaryKey(),
    /** `popup` | `newsletter` | `email` | `sms`. */
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    /** `blocks` | `zip` | `html` — skąd wzięła się treść. */
    source: text("source").notNull().default("blocks"),
    blocks: text("blocks", { mode: "json" }).notNull().$type<unknown[]>(),
    smsBody: text("sms_body").notNull().default(""),
    html: text("html").notNull().default(""),
    fileNames: text("file_names", { mode: "json" }).$type<string[] | null>(),
    popupConfig: text("popup_config", { mode: "json" }).$type<PopupConfig | null>(),
    /** `draft` | `ready`. */
    status: text("status").notNull().default("draft"),
    /**
     * Identyfikatory plików z biblioteki Media doklejanych do wiadomości.
     *
     * **Identyfikatory, nie bajty.** Ten sam cennik dopięty do pięciu
     * wiadomości leży w bazie raz; podmiana pliku w Media zmienia go wszędzie,
     * a wersje treści nie puchną o megabajty. Bajty doczytujemy dopiero przy
     * wysyłce.
     *
     * Tylko `kind === "email"` — newsletter i pop-up ich nie używają.
     */
    attachments: text("attachments", { mode: "json" }).$type<string[] | null>(),
    /** Nazwa nadawcy dla tej wiadomości. Pusto = domyślna z listy nadawców. */
    senderId: text("sender_id").notNull().default(""),
    /**
     * Wygląd wiadomości (zakładka „Style" w Design Studio).
     *
     * Jedna kolumna JSON zamiast sześciu osobnych: to zestaw ustawień
     * czytanych i zapisywanych zawsze razem, a każde kolejne pole wyglądu
     * oznaczałoby migrację. Puste = wartości domyślne renderera.
     */
    style: text("style", { mode: "json" }).$type<Record<string, string> | null>(),
    updatedAt: text("updated_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_content_items_kind").on(t.kind, t.updatedAt)],
);

// Popups currently published to the tracked site. Content items themselves
// live in localStorage — activating a popup snapshots its rendered HTML here
// so the public /popup-active endpoint can serve it to prm-tracker.js on
// external pages. Several can be live at once; `priority` decides which one a
// given visitor actually sees (lower number = checked first).
export const popupSettings = sqliteTable("popup_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contentItemId: text("content_item_id").notNull(),
  name: text("name").notNull(),
  html: text("html").notNull(),
  /** Display/targeting settings (format, size, devices, capping) — JSON blob, same modelling choice as `stages` on funnels. */
  config: text("config", { mode: "json" }).notNull().$type<PopupConfig>(),
  priority: integer("priority").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Wyświetlenia i kliknięcia opublikowanych pop-upów.
 *
 * **Osobna tabela, nie liczniki w `popup_settings`.** Licznik odpowiada tylko na
 * „ile było", a nie na „ile w zeszłym tygodniu" ani „czy ktoś klikał, zanim
 * zmieniliśmy treść". Wiersz na zdarzenie jest tańszy w zapisie niż `update`
 * (brak rywalizacji o ten sam wiersz) i pozwala te pytania zadać później.
 *
 * `visitorId` służy wyłącznie do odróżnienia „100 wyświetleń u 100 osób" od
 * „100 wyświetleń u jednej" — to identyfikator z trackera, nie dane osobowe.
 */
export const popupEvents = sqliteTable(
  "popup_events",
  {
    id: text("id").primaryKey(),
    /** Wiersz `popup_settings`. Zostaje po usunięciu publikacji — historia ma przeżyć wyłączenie pop-upu. */
    settingsId: integer("settings_id"),
    /** Treść, której dotyczyło zdarzenie — po niej łączymy statystyki z listą w module. */
    contentItemId: text("content_item_id").notNull(),
    /** `impression` albo `click`. */
    kind: text("kind").notNull(),
    visitorId: text("visitor_id").notNull().default(""),
    /** Adres strony, na której to się stało — do sprawdzenia, gdzie pop-up naprawdę pracuje. */
    url: text("url").notNull().default(""),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_popup_events_item").on(t.contentItemId, t.createdAt)],
);

/**
 * Biblioteka Media — pliki graficzne dla e-maili, newsletterów i pop-upów.
 *
 * Bajty leżą na dysku obok bazy (wzorzec z dokumentów pacjentów), tu tylko
 * metadane. **Serwowanie jest publiczne** (`/media-file/:id`) — w przeciwieństwie
 * do dokumentów: obrazek wysłany w e-mailu pobiera klient pocztowy pacjenta,
 * bez żadnej sesji. Dlatego identyfikator jest losowy (UUID), a nie kolejny —
 * to jedyna rzecz, która chroni przed przeglądaniem biblioteki po numerach.
 *
 * `folder` to kanał, dla którego grafika powstała (`email` / `newsletter` /
 * `popup` / `inne`) — struktura, którą widać w zakładce Media.
 */
export const mediaFiles = sqliteTable(
  "media_files",
  {
    id: text("id").primaryKey(),
    folder: text("folder").notNull().default("inne"),
    fileName: text("file_name").notNull(),
    /** Nazwa na dysku — UUID + rozszerzenie, żeby dwa pliki „baner.png" nie walczyły o miejsce. */
    storedName: text("stored_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_media_files_folder").on(t.folder, t.createdAt)],
);

/**
 * Feed — wgrany arkusz z danymi do użycia w wiadomościach.
 *
 * **Kolumny są dowolne.** Placówka wgrywa plik, jaki ma: raz listę lekarzy
 * z linkami do opinii, raz katalog produktów. Nazwy kolumn odczytujemy
 * z nagłówka i zapamiętujemy; nic w kodzie nie zakłada, jak się nazywają.
 *
 * Jeden arkusz = jeden feed. Skoroszyt z kilkoma arkuszami daje kilka feedów,
 * bo mają różne kolumny i różne przeznaczenie.
 */
export const feeds = sqliteTable("feeds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Nazwy kolumn w kolejności z pliku — do podpowiedzi przy wstawianiu pól. */
  columns: text("columns", { mode: "json" }).notNull().$type<string[]>().default([]),
  /**
   * Kolumna, po której dopasowujemy wiersz do odbiorcy (np. „Nazwisko").
   *
   * Pusta = feed bez dopasowania: wiersz wskazuje się wtedy wprost przy
   * wstawianiu pola. Nie każdy feed jest per odbiorca — katalog produktów
   * bywa tym samym dla wszystkich.
   */
  keyColumn: text("key_column").notNull().default(""),
  /** Nazwa pliku źródłowego — żeby dało się poznać, skąd te dane. */
  sourceFile: text("source_file").notNull().default(""),
  rowCount: integer("row_count").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

/**
 * Wiersze feedu.
 *
 * Cała zawartość w jednym JSON-ie kluczowanym nazwą kolumny, a nie kolumnami
 * tabeli: struktura jest inna w każdym pliku, więc kolumny SQL musiałyby
 * powstawać migracją przy każdym wgraniu.
 *
 * `keyValue` jest wyciągnięty osobno i zaindeksowany — po nim idzie
 * dopasowanie przy wysyłce, a szukanie po polu w JSON-ie przy tysiącach
 * odbiorców byłoby pełnym skanem na każdą wiadomość.
 */
export const feedRows = sqliteTable(
  "feed_rows",
  {
    id: text("id").primaryKey(),
    feedId: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    /** Wartość kolumny kluczowej, złożona do porównania (małe litery, bez polskich znaków). */
    keyValue: text("key_value").notNull().default(""),
    rowIndex: integer("row_index").notNull(),
    data: text("data", { mode: "json" }).notNull().$type<Record<string, string>>(),
  },
  (t) => [index("idx_feed_rows_key").on(t.feedId, t.keyValue)],
);

/**
 * Plany leczenia — gotowe materiały wysyłane pacjentowi.
 *
 * Powód istnienia: plan dietetyczny po zabiegu bariatrycznym, zalecenia po
 * zabiegu, instrukcja przygotowania do badania. Rzeczy, które placówka pisze
 * **raz**, a wysyła setki razy — dziś kopiowane z Worda do treści maila, przez
 * co każda kopia żyje własnym życiem i nikt nie wie, którą wersję dostał
 * pacjent.
 *
 * **To nie jest szablon wiadomości.** Szablon to cała wiadomość; plan to jej
 * fragment, wstawiany do dowolnej treści znacznikiem `%%PLAN%%` — ten sam plan
 * może pójść mailem powitalnym, newsletterem i automatyzacją, a poprawiony
 * jest w jednym miejscu.
 */
export const treatmentPlans = sqliteTable("treatment_plans", {
  id: text("id").primaryKey(),
  /**
   * Nazwa — jednocześnie klucz w znaczniku `%%PLAN:nazwa%%`.
   *
   * Tak samo jak feedy identyfikują się nazwą. Osobny identyfikator w treści
   * byłby odporniejszy na zmianę nazwy, ale nieczytelny dla człowieka, który
   * zagląda w kod maila — a przy feedach ta decyzja już zapadła i dwa różne
   * zwyczaje w jednym edytorze są gorsze niż jeden niedoskonały.
   */
  name: text("name").notNull(),
  /** Grupa, np. „Bariatria", „Kardiologia" — do porządku na liście, nie do logiki. */
  category: text("category").notNull().default(""),
  /** Notatka dla zespołu. Nie trafia do pacjenta. */
  description: text("description").notNull().default(""),
  /** Treść planu w HTML — to widzi pacjent. */
  html: text("html").notNull().default(""),
  /** Wyłączony plan zostaje w bazie i w historii, ale nie podpowiada się przy przypisywaniu. */
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type TreatmentPlanRow = typeof treatmentPlans.$inferSelect;

/**
 * Przypisanie planu pacjentowi.
 *
 * Historia, nie stan: pacjent po bariatrii dostaje kolejno plan
 * przedoperacyjny, płynny i stały. `%%PLAN%%` w treści bierze **ostatni
 * przypisany**, a poprzednie zostają, bo za pół roku ktoś zapyta, co temu
 * pacjentowi wysłano w marcu.
 */
export const contactTreatmentPlans = sqliteTable(
  "contact_treatment_plans",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").notNull(),
    planId: text("plan_id")
      .notNull()
      .references(() => treatmentPlans.id, { onDelete: "cascade" }),
    /** Kto przypisał — imię i nazwisko, zapisane na sztywno. */
    assignedBy: text("assigned_by").notNull().default(""),
    note: text("note").notNull().default(""),
    assignedAt: integer("assigned_at").notNull(),
  },
  (t) => [index("idx_contact_plans").on(t.contactId, t.assignedAt)],
);

export type ContactTreatmentPlanRow = typeof contactTreatmentPlans.$inferSelect;

export const trackingPings = sqliteTable(
  "tracking_pings",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    contactToken: text("contact_token"),
    url: text("url").notNull(),
    title: text("title").notNull().default(""),
    referrer: text("referrer").notNull().default(""),
    /**
     * Domena, z której przyszedł sygnał — wyliczana z adresu strony po stronie
     * serwera, a nie deklarowana przez skrypt.
     *
     * Bez tego nie da się odpowiedzieć na jedyne pytanie, które przy śledzeniu
     * naprawdę się liczy: „czy z TEJ konkretnej strony coś do nas dociera”.
     * Wcześniej status był jeden dla całego systemu, więc jedna działająca
     * witryna maskowała drugą, na której kodu w ogóle nie było.
     */
    host: text("host").notNull().default(""),
    receivedAt: integer("received_at").notNull(),
  },
  (t) => [index("idx_pings_contact_token").on(t.contactToken), index("idx_pings_host").on(t.host)],
);

/**
 * Domeny, na których zainstalowano kod śledzący.
 *
 * Lista nie jest ozdobą: `/collect` odrzuca sygnały spoza niej (dopóki lista
 * jest pusta — przyjmuje wszystko, żeby nie uciszyć działającej instalacji
 * w momencie aktualizacji), a status każdej pozycji liczy się z realnie
 * odebranych sygnałów. Deklaracja „śledzimy tę domenę” i fakt „sygnały stamtąd
 * przychodzą” to dwie różne rzeczy i ekran ma pokazywać obie.
 */
export const trackingDomains = sqliteTable("tracking_domains", {
  /** Host bez protokołu i bez końcowego ukośnika, małymi literami: „klinika-abc.pl”. */
  domain: text("domain").primaryKey(),
  /** Notatka użytkownika — po co ta domena jest na liście. */
  label: text("label").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

export type TrackingDomainRow = typeof trackingDomains.$inferSelect;

export interface FunnelStageRow {
  id: string;
  label: string;
  description: string;
}

export const funnels = sqliteTable("funnels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  stages: text("stages", { mode: "json" }).notNull().$type<FunnelStageRow[]>(),
  updatedAt: text("updated_at").notNull(),
});

export const contactFunnelProgress = sqliteTable("contact_funnel_progress", {
  contactId: text("contact_id").primaryKey(),
  funnelId: text("funnel_id").notNull(),
  stageIndex: integer("stage_index").notNull(),
});

export const emailSends = sqliteTable(
  "email_sends",
  {
    token: text("token").primaryKey(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    contentItemId: text("content_item_id"),
    /**
     * Kampania, w ramach której poszła ta wiadomość.
     *
     * **Bez tego dwie kampanie na tym samym szablonie są nie do rozróżnienia.**
     * `contentItemId` mówi tylko „którym szablonem", a raport wysyłki musi
     * odpowiedzieć na pytanie „ta wysyłka, z 19 sierpnia, do tego segmentu".
     * Puste dla wiadomości spoza kampanii: testów, automatyzacji i kodów.
     */
    campaignId: text("campaign_id"),
    sentAt: integer("sent_at").notNull(),
  },
  (t) => [
    index("idx_email_sends_to").on(t.toEmail),
    index("idx_email_sends_campaign").on(t.campaignId),
  ],
);

export const emailEvents = sqliteTable(
  "email_events",
  {
    id: text("id").primaryKey(),
    token: text("token")
      .notNull()
      .references(() => emailSends.token, { onDelete: "cascade" }),
    /**
     * `open` i `click` liczymy sami (piksel i przepisane odnośniki). Reszta
     * przychodzi z Event Webhooka SendGrida i **bez niego nie istnieje** —
     * o tym, czy wiadomość dotarła, odbiła się albo trafiła do spamu, wie
     * wyłącznie serwer pocztowy. Dopóki webhook nie jest wpięty, raport ma
     * pokazywać „brak danych", a nie wyliczoną z niczego wartość.
     */
    kind: text("kind")
      .notNull()
      .$type<
        "open" | "click" | "delivered" | "bounce" | "dropped" | "spamreport" | "unsubscribe"
      >(),
    url: text("url"),
    /** Powód odrzucenia podany przez serwer odbiorcy — tylko dla `bounce`/`dropped`. */
    reason: text("reason"),
    occurredAt: integer("occurred_at").notNull(),
  },
  (t) => [index("idx_email_events_token").on(t.token)],
);

export const automations = sqliteTable("automations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // No trigger column and no audience column: what starts an automation is
  // read from `flow` (triggerLabel), and how many contacts entered it is
  // counted from `automation_runs` (getRunCounts). Neither is duplicated onto
  // the row, because a copy that nothing keeps in sync becomes a lie.
  status: text("status").notNull().default("draft").$type<AutomationStatus>(),
  flow: text("flow", { mode: "json" }).$type<AutomationGraph | null>(),
  updatedAt: text("updated_at").notNull(),
});

// Notes on a contact card. Written by hand from the Notes tab, and
// automatically by popup surveys / forms with custom fields (which have
// nowhere else to land, since `contacts` has fixed columns).
export const contactNotes = sqliteTable("contact_notes", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull(),
  text: text("text").notNull(),
  /** "manual" | "survey" | "form" — lets the UI label where a note came from. */
  source: text("source").notNull().default("manual"),
  createdAt: integer("created_at").notNull(),
});

/**
 * Status kontaktu — **dowolny klucz**, nie zamknięta lista.
 *
 * Kiedyś była to unia czterech wartości; placówki potrzebują
 * dodawać własne (np. „Lekarze"), więc typ musiał się otworzyć.
 * Cztery wbudowane zostają w `BUILTIN_STATUSES` — są wsiewane do
 * `contact_statuses` i nie dają się usunąć, bo odwołują się do nich filtry
 * i segmenty.
 */
export type ContactStatus = string;

/** Statusy wsiewane na starcie; nieusuwalne. Kolejność = kolejność na listach. */
export const BUILTIN_STATUSES: { key: string; label: string; color: string }[] = [
  { key: "lead", label: "Lead", color: "oklch(0.78 0.14 85)" },
  { key: "patient", label: "Pacjent", color: "oklch(0.58 0.18 250)" },
  { key: "active", label: "Aktywny", color: "oklch(0.68 0.16 165)" },
  { key: "inactive", label: "Nieaktywny", color: "oklch(0.72 0.02 250)" },
];

/** How a contact field is rendered on the card and in the field editor. */
export type ContactFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "boolean"
  /** Multi-value chips — what segments and tags already are. */
  | "list";

/**
 * What the contact card shows, and under what name.
 *
 * Two kinds of row live here. `builtin = 1` describes a real column on
 * `contacts` — renaming one changes the **label**, never the column, because
 * the column name is what every query, export and MCP tool is written against.
 * `builtin = 0` is a field the clinic added; its value lives in
 * `contacts.custom_fields` under this key.
 *
 * The table is seeded from the built-in list on first read, so a fresh install
 * behaves exactly like one where nobody has opened the settings tab.
 */
/**
 * Statusy kontaktu — definiowane przez placówkę, nie wpisane w kod.
 *
 * Cztery wbudowane (lead, pacjent, aktywny, nieaktywny) są wsiewane na starcie
 * i **nie dają się usunąć**: filtry, segmenty i wykresy odwołują się do nich po
 * kluczu, a skasowanie zostawiłoby kontakty ze statusem, którego nikt nie
 * potrafi nazwać. Własne (np. „Lekarze") można dodawać, zmieniać nazwę i barwę
 * oraz usuwać, o ile żaden kontakt ich nie używa.
 *
 * Klucz jest **niezmienny po utworzeniu** — siedzi w kolumnie `contacts.status`
 * i w definicjach segmentów; zmiana klucza osierociłaby i jedno, i drugie.
 * Zmienia się etykietę, nie klucz.
 */
export const contactStatuses = sqliteTable("contact_statuses", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  /** Barwa na wykresach i plakietkach — dowolny kolor CSS. */
  color: text("color").notNull().default(""),
  builtin: integer("builtin").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const contactFieldDefs = sqliteTable("contact_field_defs", {
  /** Column name for built-ins (`firstName`), `custom_*` for user-added fields. */
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  type: text("type").notNull().$type<ContactFieldType>(),
  /** Choices for `select` fields; empty for every other type. */
  options: text("options", { mode: "json" }).notNull().$type<string[]>().default([]),
  /** Shown under the field in the editor — the clinic's own note about what goes in it. */
  hint: text("hint").notNull().default(""),
  builtin: integer("builtin").notNull().default(0),
  /**
   * Fields the rest of the app cannot work without: name, e-mail, PRM ID.
   * They can be renamed, but not hidden and not deleted.
   */
  locked: integer("locked").notNull().default(0),
  visible: integer("visible").notNull().default(1),
  /**
   * Statusy, przy których to pole ma się pokazywać na karcie.
   *
   * **Pusta lista = wszystkie statusy** — takie było zachowanie przed
   * wprowadzeniem przypisań i takie zostaje dla pól, których nikt nie
   * przypisał. Gdyby puste znaczyło „żaden", wszystkie istniejące pola
   * zniknęłyby z kart w dniu wdrożenia.
   */
  statuses: text("statuses", { mode: "json" }).notNull().$type<string[]>().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Consents tracked per contact. Deliberately narrow — three that the clinic
 * actually acts on, rather than a long list nobody maintains.
 *
 * `email` and `sms` gate marketing sends. `profiling` does not gate anything:
 * it records permission to segment and personalise, which RODO wants written
 * down even though no send depends on it.
 */
export type ConsentChannel = "email" | "sms" | "profiling";

export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(),
  prmId: text("prm_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  pesel: text("pesel").notNull().default(""),
  segments: text("segments", { mode: "json" }).notNull().$type<string[]>(),
  tags: text("tags", { mode: "json" }).notNull().$type<string[]>(),
  source: text("source").notNull().default(""),
  medium: text("medium").notNull().default(""),
  campaign: text("campaign").notNull().default(""),
  createdAt: text("created_at").notNull(),
  status: text("status").notNull().default("lead").$type<ContactStatus>(),

  /**
   * Kiedy ten kontakt był ostatnio odświeżony z systemu rezerwacji (epoch ms).
   *
   * **Powstało, bo synchronizacja odświeżała w kółko te same 500 kontaktów.**
   * Zapytanie brało `limit(500)` bez żadnego porządku, więc SQLite oddawał
   * wciąż ten sam początek tabeli: pacjent dopisany później nigdy nie doczekał
   * się pobrania wizyt ani ceny, a dziennik pokazywał „synchronizacja
   * wykonana" — bo formalnie była.
   *
   * Sortowanie po tym polu rosnąco (puste najpierw) zamienia to w rotację:
   * najdawniej odświeżony idzie pierwszy, więc każdy kontakt prędzej czy
   * później dostaje swoją kolej.
   */
  externalSyncedAt: integer("ic_synced_at"),

  // ── consents ──────────────────────────────────────────────────────────────
  // Default 0: a contact created without anybody recording a consent has none.
  // The lead collectors set them explicitly (a filled-in form IS the consent),
  // and the 0024 migration granted them to everyone who was already in the
  // base — a deliberate decision.
  consentEmail: integer("consent_email").notNull().default(0),
  consentSms: integer("consent_sms").notNull().default(0),
  consentProfiling: integer("consent_profiling").notNull().default(0),
  /** How the consent was obtained — "formularz", "zapier", "import", "ręcznie", "migracja". */
  consentSource: text("consent_source").notNull().default(""),
  consentUpdatedAt: integer("consent_updated_at"),

  /**
   * Values of user-defined fields, keyed by `contact_field_defs.key`.
   *
   * A JSON blob rather than one column per field, for the same reason funnel
   * stages and automation graphs are blobs: the shape is defined by the user at
   * runtime, and a schema migration per added field is not something a
   * receptionist can run. The trade-off is that custom fields cannot be
   * filtered in SQL — acceptable while they are display-and-edit only.
   */
  customFields: text("custom_fields", { mode: "json" })
    .notNull()
    .$type<Record<string, string>>()
    .default({}),

  /**
   * Pacjent znany na razie tylko z telefonu — moduł „Kontakty telefoniczne”.
   *
   * To ten sam pacjent co w Kontaktach, w innym stanie, a nie osobny byt. Stąd
   * kolumna, a nie druga tabela: oś czasu, notatki, zgody, historia SMS-ów,
   * segmenty i automatyzacje działają dla niego od razu, bez duplikowania
   * czegokolwiek. Uzupełnienie imienia i nazwiska zdejmuje ten znacznik i tym
   * samym przenosi kontakt do Kontaktów — to jedno pole, nie migracja danych.
   *
   * Domyślnie 0, więc żaden istniejący kontakt nigdzie nie znika.
   */
  phoneOnly: integer("phone_only").notNull().default(0),
  /**
   * Patient ID in the clinic's booking system (`src/lib/booking-system`) — the
   * only reliable link between our contact and the system's patient record;
   * email and phone often differ on the two sides. The column keeps its
   * historical name.
   */
  externalPatientId: integer("ic_patient_id"),
});

/**
 * Wysłane SMS-y — historia, której wcześniej nie było nigdzie poza logiem silnika.
 *
 * Świadomie NIE trafiają do skrzynki odbiorczej: wysyłka kampanijna do
 * wszystkich nie jest rozmową i zasypałaby wątki, które naprawdę czekają na
 * odpowiedź człowieka (patrz komentarz przy `recordOutboundMessage`). Osobna
 * tabela daje jedno i drugie: oś czasu pacjenta pokazuje, co do niego poszło,
 * a skrzynka zostaje skrzynką.
 */
/**
 * Dokumenty pacjenta — skierowania, wyniki, podpisane zgody.
 *
 * W bazie leżą wyłącznie METADANE; sam plik ląduje na wolumenie `/data/documents`,
 * czyli tam gdzie baza, a więc obejmuje go ta sama kopia zapasowa i to samo
 * przeżywanie wydań. Trzymanie plików w SQLite rozdęłoby bazę, spowolniło każdą
 * kopię i zamieniło pobranie pliku w odczyt całego wiersza do pamięci.
 *
 * `storedName` jest losowa i nie ma nic wspólnego z nazwą pokazywaną
 * użytkownikowi: nazwa od pacjenta trafia do bazy jako tekst, a nie na dysk,
 * więc `../../etc/passwd` w nazwie pliku nie ma jak nic zepsuć.
 */
export const contactDocuments = sqliteTable(
  "contact_documents",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").notNull(),
    /** Nazwa pokazywana człowiekowi — tak, jak nazywał plik. */
    fileName: text("file_name").notNull(),
    /** Nazwa na dysku: losowa, bez znaczenia semantycznego. */
    storedName: text("stored_name").notNull(),
    mimeType: text("mime_type").notNull().default(""),
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** Notatka od osoby wgrywającej — po co ten plik tu jest. */
    note: text("note").notNull().default(""),
    uploadedBy: text("uploaded_by").notNull().default(""),
    uploadedAt: integer("uploaded_at").notNull(),
  },
  (t) => [index("idx_documents_contact").on(t.contactId)],
);

export type ContactDocumentRow = typeof contactDocuments.$inferSelect;

/**
 * `paused` doszedł później: „Zatrzymaj" kasowało wysyłkę bezpowrotnie, więc
 * jedno kliknięcie w trakcie wysyłki do ośmiu tysięcy osób nie dawało się
 * cofnąć. Teraz zatrzymanie wstrzymuje, a dopiero „Anuluj" zamyka na dobre.
 */
export type CampaignStatus = "scheduled" | "sending" | "paused" | "sent" | "cancelled" | "failed";

/**
 * Wysyłka szablonu do segmentu — „Wyślij do…” z modułów Newsletter / Email / SMS.
 *
 * Dwie rzeczy są tu celowo rozdzielone:
 *
 * • **Treść jest zamrażana** w chwili zaplanowania (migawka w `content_snapshots`,
 *   ten sam mechanizm, z którego korzystają automatyzacje). Wiadomość zaplanowana
 *   na czwartek ma wyjść w brzmieniu, które ktoś zatwierdził we wtorek — a nie
 *   w tym, które ktoś zdążył w międzyczasie pozmieniać.
 *
 * • **Odbiorcy są wyliczani dopiero przy wysyłce.** Segment jest definicją, nie
 *   listą; zamrożenie listy przy planowaniu oznaczałoby wysyłkę do pacjentów,
 *   którzy przez te dwa dni zdążyli wypisać się ze zgód, i pominięcie tych,
 *   którzy właśnie do segmentu weszli.
 */
export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    /** "newsletter" | "email" | "sms" */
    kind: text("kind").notNull(),
    /** Nazwa szablonu — klucz migawki, tak samo jak w węzłach automatyzacji. */
    templateName: text("template_name").notNull(),
    segmentId: text("segment_id").notNull(),
    /** Nazwa segmentu zapisana na sztywno: segment można później zmienić albo usunąć, a historia ma zostać czytelna. */
    segmentName: text("segment_name").notNull().default(""),
    subject: text("subject").notNull().default(""),
    /** Tagi dopisywane odbiorcom — pozwalają potem zbudować segment „dostał tę wysyłkę”. */
    tags: text("tags", { mode: "json" }).notNull().$type<string[]>().default([]),
    /** Kiedy wysłać. `null` znaczy „od razu”. */
    scheduledAt: integer("scheduled_at"),
    /** Minutę przed wysyłką silnik przelicza segment i zapisuje tu liczbę odbiorców. */
    recountAt: integer("recount_at"),
    status: text("status").notNull().default("scheduled").$type<CampaignStatus>(),
    /** Ilu odbiorców naliczono — najpierw podgląd przy planowaniu, potem przeliczenie tuż przed wysyłką. */
    audienceCount: integer("audience_count"),
    sentCount: integer("sent_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),

    // ── Tempo wysyłki ────────────────────────────────────────────────────
    //
    // Limity są **na kampanię**, nie globalne: dwie równoległe wysyłki mają
    // dwa własne budżety. Tak to zostało ustalone („wysyłka SMS do segmentu X
    // 100 na godzinę, maksymalnie 600 na dzień") i tak jest to czytelne dla
    // człowieka, który planuje jedną konkretną wysyłkę.
    //
    // `null` = bez limitu, czyli zachowanie sprzed tej zmiany. Kampanie
    // założone wcześniej mają NULL i lecą pełną parą, tak jak leciały.
    /**
     * Godziny, w których wolno wysyłać — „HH:MM", czas polski.
     *
     * Puste = całą dobę. Ustawienie `07:00`–`18:00` znaczy jednocześnie
     * „cisza od 18:00 do 7:00" — to ta sama rzecz opisana z drugiej strony,
     * więc jest jednym ustawieniem, a nie dwoma.
     *
     * **Okno wolno przełożyć przez północ** (`22:00`–`06:00`). Nietypowe, ale
     * wynika wprost z tego, że to zwykłe dwie godziny, a nie „od rana do
     * wieczora"; brak obsługi tego przypadku znaczyłby cichą wysyłkę o złej
     * porze albo kampanię, która nigdy nie rusza.
     */
    sendFrom: text("send_from").notNull().default(""),
    sendTo: text("send_to").notNull().default(""),
    /** Ile wiadomości na godzinę. `null` = bez ograniczenia. */
    perHourLimit: integer("per_hour_limit"),
    /** Ile wiadomości na dobę (doba liczona wg czasu polskiego). `null` = bez ograniczenia. */
    perDayLimit: integer("per_day_limit"),
    /** Początek bieżącego okna godzinowego (ms epoki). */
    hourWindowAt: integer("hour_window_at"),
    /** Ile wysłano w bieżącym oknie godzinowym. */
    hourSentCount: integer("hour_sent_count").notNull().default(0),
    /** Doba, której dotyczy `daySentCount` — YYYY-MM-DD czasu polskiego. */
    dayKey: text("day_key").notNull().default(""),
    /** Ile wysłano w tej dobie. */
    daySentCount: integer("day_sent_count").notNull().default(0),
    /**
     * Do kiedy kampania czeka na odblokowanie limitu (ms epoki).
     *
     * Zapisane wyłącznie po to, żeby lista wysyłek mogła napisać „wznowi się
     * o 14:30" zamiast pokazywać kampanię, która „trwa", ale nic nie robi.
     * Silnik i tak przelicza budżet od nowa przy każdym tiku.
     */
    throttledUntil: integer("throttled_until"),

    error: text("error").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
  },
  (t) => [index("idx_campaigns_status").on(t.status)],
);

export type CampaignRow = typeof campaigns.$inferSelect;

export const smsSends = sqliteTable(
  "sms_sends",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").notNull(),
    toPhone: text("to_phone").notNull(),
    /** Nadawca, którym poszła wiadomość — nazwa alfanumeryczna albo numer. */
    sender: text("sender").notNull().default(""),
    body: text("body").notNull(),
    /** "automation" | "manual" | "agent" | "campaign" — kto ją wywołał. */
    source: text("source").notNull().default("automation"),
    automationId: text("automation_id"),
    /**
     * Kampania, w ramach której poszedł ten SMS.
     *
     * Ta sama luka co przy e-mailu: wysyłka do segmentu ustawiała
     * `automationId: null`, więc **nie dało się policzyć raportu kampanii
     * SMS** — nic nie łączyło wiadomości z wysyłką, która ją zleciła.
     */
    campaignId: text("campaign_id"),
    sentAt: integer("sent_at").notNull(),
  },
  (t) => [
    index("idx_sms_sends_contact").on(t.contactId),
    index("idx_sms_sends_campaign").on(t.campaignId),
  ],
);

/**
 * Every consent the clinic tracks — the three built-ins and whatever else it
 * adds (photo release, research participation, phone calls…).
 *
 * Replaces the old `consent_texts`, which held only the wording: a consent is
 * its label, its wording and whether it gates anything, and splitting those
 * across a hardcoded list in the UI and a table in the database is how the two
 * drift apart.
 *
 * **Built-in rows keep their value in the `contacts` columns above**; custom
 * rows keep theirs in `contact_consents`. That asymmetry is deliberate: the
 * built-ins gate sends and are read by the engine, the agent, the inbox and the
 * unsubscribe route, and moving them would mean rewriting the one gate every
 * send funnels through.
 */
export const consentDefs = sqliteTable("consent_defs", {
  /** "email" | "sms" | "profiling" for built-ins, `consent_*` for user-added ones. */
  key: text("key").primaryKey(),
  /** What the switch is called on a contact card. */
  label: text("label").notNull(),
  /** One line under the switch explaining the consequence of turning it off. */
  note: text("note").notNull().default(""),
  /** Heading of the wording shown to the patient. */
  title: text("title").notNull(),
  /** The statement the patient agrees to. A legal text, never invented by the system. */
  body: text("body").notNull(),
  /**
   * Which send channel this consent gates: "email", "sms", or "" for none.
   * Only the two built-ins gate anything — a consent the clinic adds is
   * recorded, not enforced, because there is no send path to enforce it on.
   */
  gates: text("gates").notNull().default(""),
  /** Built-ins cannot be deleted and their key cannot change. */
  builtin: integer("builtin").notNull().default(0),
  /** Retired consents stay in the table (contacts still carry their answers) but leave the card. */
  active: integer("active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Answers to the user-added consents, one row per contact per consent.
 *
 * A row per answer rather than another JSON blob on the contact: unlike a
 * custom field, a consent needs its own provenance and timestamp — "granted"
 * without knowing when and from where is an assertion, not a record.
 */
export const contactConsents = sqliteTable(
  "contact_consents",
  {
    contactId: text("contact_id").notNull(),
    consentKey: text("consent_key").notNull(),
    granted: integer("granted").notNull().default(0),
    /** "formularz" | "ręcznie" | "wypis" | "import" — how this answer was obtained. */
    source: text("source").notNull().default(""),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.consentKey] }),
    index("idx_contact_consents_key").on(t.consentKey, t.granted),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// PRM Engine — automation runtime
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A visit booked for a patient.
 *
 * Written by the booking collector (`/api/webhooks/booking`), which the clinic's
 * own WordPress plugin calls after a successful online booking. Stored as a row
 * rather than a note because the **date is the point**: a reminder automation
 * needs something it can compare against, and "Konsultacja, 20.08 o 10:30"
 * buried in prose is not that.
 *
 * `externalId` is the booking system's own id and is UNIQUE: a retried webhook
 * delivery must not become a second appointment.
 *
 * Deliberately narrow. This is not a scheduling module — the clinic's own
 * system owns the calendar, and this table only holds what marketing needs to
 * act on. In particular **cancellations and reschedules made at the reception
 * desk never reach it**, because they never pass through the website; only a
 * booking system provider (`src/lib/booking-system`) closes that gap.
 */
export const contactVisits = sqliteTable(
  "contact_visits",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").notNull(),
    /** The booking system's id — the deduplication key. */
    externalId: text("external_id").unique(),
    /** Full service name as the patient saw it: "Konsultacja laryngologiczna". */
    title: text("title").notNull(),
    /** Who the visit is with, when the source sends it. */
    doctor: text("doctor").notNull().default(""),
    /**
     * Medical speciality, as the booking system names it ("Specjalista
     * otolaryngolog").
     *
     * Kept apart from `title` on purpose: the service name carries qualifiers a
     * human wrote ("Konsultacja laryngologa [lekarz w trakcie specjalizacji]"),
     * while the speciality is the stable label worth building an audience on.
     */
    specialization: text("specialization").notNull().default(""),
    /** Start of the visit, epoch ms — what a "24 h before" reminder counts from. */
    startsAt: integer("starts_at"),
    /** As shown at booking, in grosze, so no float ever rounds a price. Null = not sent. */
    priceGrosze: integer("price_grosze"),
    /**
     * Visit state from the booking system: `booked`, `waiting`, `started`,
     * `completed`, `cancelled`, `other` (see `booking-system/status.ts`).
     *
     * Stored raw, not as a finished label, because a no-show is **derived from
     * the clock** (still `booked` two hours after the start). A stored label
     * would go stale the moment those two hours pass.
     */
    systemStatus: text("ic_status").notNull().default(""),
    /**
     * The booking system's visit ID — **kept apart from `externalId`**.
     *
     * The same consultation can arrive two ways: through the booking webhook
     * (its key in `externalId`) and from the booking system provider. Replacing
     * `externalId` with the provider's ID would break the webhook's
     * deduplication, and a retried delivery would create the visit twice. Two
     * keys side by side recognise the same appointment from both sides.
     */
    systemVisitId: integer("ic_termin_id"),
    /**
     * Which final state was already reported to the engine (`completed`,
     * `no_show`, `cancelled`) — empty until one happens.
     *
     * Needed because **a no-show is not a status change** — the visit stays
     * `booked` and the state comes from the passing of time. Without this mark
     * every sync would emit the same event again and the patient would get the
     * same message every half hour.
     */
    stateEventSent: text("ic_event_sent").notNull().default(""),
    /** Which system reported it: the booking webhook's source or the provider's name. */
    source: text("source").notNull().default(""),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_contact_visits_contact").on(t.contactId, t.startsAt)],
);

/**
 * Dynamic segments — a saved set of conditions, not a saved list of people.
 *
 * Membership is **computed on read**, never stored on the contact. A materialised
 * copy would be stale the moment somebody changed a tag, and this codebase has
 * already removed two such copies (`automations.trigger`, `automations.users`)
 * for exactly that reason.
 *
 * The definition is a JSON blob for the same reason automation graphs are: its
 * shape is authored by the user at runtime, and modelling conditions as
 * relational rows would buy nothing but joins.
 */
export const segments = sqliteTable("segments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** "draft" — still being written; "live" — ready to be used by campaigns. */
  status: text("status").notNull().default("draft").$type<"draft" | "live">(),
  definition: text("definition", { mode: "json" }).notNull().$type<SegmentDefinition>(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by").notNull().default(""),
  /**
   * Segment **stały (cykliczny)** — nie wygasa.
   *
   * Domyślnie segmenty są **doraźne**: powstają pod jedną wysyłkę i po 48
   * godzinach znikają. Bez tego lista rośnie w nieskończoność o „Kardiologia
   * marzec", „Kardiologia marzec 2", „test" — a im dłuższa lista, tym trudniej
   * znaleźć ten segment, który naprawdę jest w użyciu.
   */
  permanent: integer("permanent").notNull().default(0),
  /** Kiedy segment sam zniknie. `null` = stały. */
  expiresAt: integer("expires_at"),
});

/** Every engine event type the system can emit. Trigger nodes subscribe to these. */
export type EngineEventType =
  | "contact.created"
  /** A visit was booked — payload: { title, doctor, startsAt, price }. Fed by the booking collector. */
  | "visit.scheduled"
  | "visit.completed"
  | "visit.no_show"
  | "visit.cancelled"
  | "page.visit"
  | "email.opened"
  | "email.clicked"
  | "form.submitted"
  | "survey.submitted"
  | "contact.tag_added"
  | "contact.segment_added"
  /** Any contact field actually changing value — payload: { field, value, previous }. */
  | "contact.field_changed"
  /** A patient wrote to us — payload: { channel, preview, threadId }. Fed by the inbox collectors. */
  | "contact.message_received"
  | "funnel.stage_changed";

// One shared bus for everything that really happened. Written from the
// EXISTING write points (/collect, /e/open, /e/click, the form and survey
// collectors, contact creation, funnel progress) — the engine adds no
// collection infrastructure of its own, it only reads this table.
export const engineEvents = sqliteTable(
  "engine_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull().$type<EngineEventType>(),
    /** Null when the event couldn't be attributed to a known contact (anonymous traffic). */
    contactId: text("contact_id"),
    payload: text("payload", { mode: "json" }).notNull().$type<Record<string, string>>(),
    occurredAt: integer("occurred_at").notNull(),
    /** Set once the engine has matched this event against every active trigger. */
    processedAt: integer("processed_at"),
  },
  (t) => [
    // The tick's very first query, every 4 seconds, forever — without this it is
    // a full scan that grows with the event history.
    index("idx_engine_events_unprocessed").on(t.processedAt, t.occurredAt),
  ],
);

export type AutomationRunStatus = "running" | "waiting" | "completed" | "failed" | "stopped";

/** One contact's journey through one automation. */
export const automationRuns = sqliteTable(
  "automation_runs",
  {
    id: text("id").primaryKey(),
    automationId: text("automation_id").notNull(),
    contactId: text("contact_id").notNull(),
    currentNodeId: text("current_node_id"),
    status: text("status").notNull().default("running").$type<AutomationRunStatus>(),
    /** Node ids visited so far, in order — also the step counter for the loop guard. */
    path: text("path", { mode: "json" }).notNull().$type<string[]>(),
    /** The event that started this run, for context in AI nodes and the timeline. */
    triggerEventId: text("trigger_event_id"),
    lastError: text("last_error"),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
  },
  (t) => [
    // The per-event in-flight check (automation, contact, live status) and every
    // per-automation listing share this prefix.
    index("idx_runs_automation_contact").on(t.automationId, t.contactId, t.status),
    index("idx_runs_status").on(t.status),
  ],
);

// "processing" is the crash-safety state: a job is claimed BEFORE its action
// executes, so a server dying mid-send leaves a visibly stuck "processing" job
// (reported by the M4 supervisor) instead of a pending one that would re-send
// the same email after restart. At-most-once for sends, on purpose.
export type EngineJobStatus = "pending" | "processing" | "done" | "failed";

// The durable work queue. A "wait 2 days" node is simply a job with a dueAt in
// the future, which is why delays survive a server restart. `idempotencyKey`
// is unique, so a step can never be scheduled — and therefore never executed —
// twice, no matter how ticks overlap or retries land.
export const engineJobs = sqliteTable(
  "engine_jobs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    dueAt: integer("due_at").notNull(),
    status: text("status").notNull().default("pending").$type<EngineJobStatus>(),
    attempts: integer("attempts").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_engine_jobs_due").on(t.status, t.dueAt),
    index("idx_engine_jobs_run").on(t.runId),
  ],
);

/** Full observability: one row per engine step, including AI token spend once M3 lands. */
export const engineLog = sqliteTable(
  "engine_log",
  {
    id: text("id").primaryKey(),
    runId: text("run_id"),
    automationId: text("automation_id"),
    contactId: text("contact_id"),
    nodeId: text("node_id"),
    /** "run_started" | "action" | "condition" | "delay" | "skipped" | "error" | "run_ended" | "ai" */
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    detail: text("detail", { mode: "json" }).$type<Record<string, string>>(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsd: real("cost_usd"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_log_contact").on(t.contactId, t.createdAt),
    index("idx_log_kind").on(t.kind, t.createdAt),
    index("idx_log_run").on(t.runId),
  ],
);

// Content items still live in localStorage, out of the server's reach, so an
// automation that "sends the Welcome email" needs a server-side copy of it.
// The UI pushes a rendered snapshot here when an automation goes active —
// exactly the pattern popup publishing already uses. Merge-tag chips are kept
// UNRESOLVED in the stored HTML; the engine resolves them per recipient at
// send time, so one snapshot serves every contact.
export const contentSnapshots = sqliteTable("content_snapshots", {
  /** `${kind}:${name}` — node configs reference templates by name, not id. */
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  contentItemId: text("content_item_id").notNull(),
  subject: text("subject").notNull().default(""),
  html: text("html").notNull().default(""),
  smsBody: text("sms_body").notNull().default(""),
  /** Popup templates only: display/targeting settings, so an engine-queued popup looks like the published one. */
  config: text("config", { mode: "json" }).$type<PopupConfig | null>(),
  /**
   * Załączniki (identyfikatory plików Media) przeniesione z treści.
   *
   * Migawka musi je nieść, inaczej załączniki działałyby w wysyłce testowej
   * i **cicho znikały w prawdziwej kampanii** — silnik wysyła z migawki, nie
   * z bieżącej treści. To ten sam rodzaj cichej straty, co przy imporcie CSV.
   */
  attachments: text("attachments", { mode: "json" }).$type<string[] | null>(),
  /** Nazwa nadawcy dla tej wiadomości. Pusto = domyślna z listy nadawców. */
  senderId: text("sender_id").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export type InsightKind = "performance" | "security" | "pattern";
export type InsightSeverity = "info" | "warning" | "critical";
/**
 * "resolved" is set by the supervisor itself when a finding stops reproducing:
 * a problem the user has actually fixed must leave the panel and the bell on
 * its own. Without it every alert would be permanent, and a permanent alert is
 * one nobody reads.
 */
export type InsightStatus = "new" | "acknowledged" | "dismissed" | "resolved";

// M4: what the PRM_Agent noticed while watching the engine. Rows are produced
// by supervisor.server.ts — mostly by deterministic detectors reading the
// engine's own tables, optionally enriched by a model pass.
//
// `signature` is the dedup key: the same finding rediscovered on the next sweep
// must update the existing row (count, timestamp) instead of stacking a second
// copy of "ta automatyzacja się wysypuje" every few minutes.
export const agentInsights = sqliteTable("agent_insights", {
  id: text("id").primaryKey(),
  signature: text("signature").notNull().unique(),
  kind: text("kind").notNull().$type<InsightKind>(),
  severity: text("severity").notNull().$type<InsightSeverity>(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  /** What the user could do about it — plain language, not a command to execute. */
  proposedAction: text("proposed_action").notNull().default(""),
  /** Numbers behind the claim, so the panel can show why this was raised. */
  evidence: text("evidence", { mode: "json" }).$type<Record<string, string>>(),
  automationId: text("automation_id"),
  status: text("status").notNull().default("new").$type<InsightStatus>(),
  /** True when a model wrote it rather than a detector — shown in the UI. */
  fromAi: integer("from_ai").notNull().default(0),
  /** How many sweeps in a row have seen this. */
  seenCount: integer("seen_count").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Popups the engine has queued for ONE contact (the show_popup action). The
// global `popup_settings` rows are shown to everybody; these wait for a
// specific patient and are handed out by /popup-active once the tracker
// identifies them by their click token. Rows carry their own HTML+config
// snapshot for the same reason popup_settings does: the content item lives in
// localStorage, where the server cannot reach it.
export const popupQueue = sqliteTable(
  "popup_queue",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").notNull(),
    contentItemId: text("content_item_id").notNull(),
    name: text("name").notNull(),
    html: text("html").notNull(),
    config: text("config", { mode: "json" }).notNull().$type<PopupConfig>(),
    /** Where this came from — lets the delivery confirmation land on the right automation's log. */
    automationId: text("automation_id"),
    runId: text("run_id"),
    nodeId: text("node_id"),
    createdAt: integer("created_at").notNull(),
    /** A popup nobody came back to collect must not surface months later. */
    expiresAt: integer("expires_at").notNull(),
    /** Null until the tracker confirms it actually rendered it. */
    shownAt: integer("shown_at"),
  },
  (t) => [index("idx_popup_queue_contact").on(t.contactId, t.shownAt)],
);

/**
 * Engine-wide runtime settings. `baseUrl` matters because the engine sends
 * mail with no incoming request to derive an origin from, yet tracking pixels
 * and click redirects must point at an absolute address — the UI writes the
 * origin it is served from, and APP_BASE_URL in .env overrides it.
 */
export const engineSettings = sqliteTable("engine_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  baseUrl: text("base_url").notNull().default(""),
  enabled: integer("enabled").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export type AiProviderId = "anthropic" | "openai" | "google";

/**
 * Which LLM the PRM_Agent runs on, and how much it may spend per day.
 * API keys are NOT here — they live in .env only, same convention as SendGrid
 * and Twilio. This table holds the swappable, non-secret half of the config.
 */
export const aiSettings = sqliteTable("ai_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull().default("anthropic").$type<AiProviderId>(),
  model: text("model").notNull().default("claude-opus-5"),
  /** Daily spend ceiling in USD. Once crossed, AI nodes stop; the deterministic engine keeps running. */
  dailyLimitUsd: real("daily_limit_usd").notNull().default(5),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Clinic knowledge the PRM_Agent may draw on when it writes to a patient —
 * price lists, procedure descriptions, opening hours, standard answers.
 * Editable in Ustawienia → PRM_Agent, injected into the agent's context only
 * on nodes allowed to message, so the token cost follows the feature that
 * needs it.
 */
export const knowledgeEntries = sqliteTable("knowledge_entries", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Omnichannel inbox — conversations with patients
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Channels a conversation can happen on. WhatsApp and Messenger are absent on
 * purpose: neither has an integration, and a channel tab that can never receive
 * anything is exactly the kind of decoration this section is being rebuilt to
 * remove.
 */
export type InboxChannel = "email" | "sms" | "form" | "survey";
export type InboxDirection = "in" | "out";
export type InboxThreadStatus = "open" | "closed";

/**
 * One conversation: **one thread per contact per channel**, not one per subject.
 * A clinic inbox is read like a messenger — "what did we say to this patient over
 * SMS" — and threading e-mail by subject would scatter that across rows the
 * moment a patient replies with a new subject line. The unique index enforces it.
 */
export const inboxThreads = sqliteTable(
  "inbox_threads",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").notNull(),
    channel: text("channel").notNull().$type<InboxChannel>(),
    subject: text("subject").notNull().default(""),
    /** Denormalised for the list view — the alternative is a correlated subquery per row. */
    lastPreview: text("last_preview").notNull().default(""),
    lastDirection: text("last_direction").notNull().default("in").$type<InboxDirection>(),
    lastMessageAt: integer("last_message_at").notNull(),
    /** Count of inbound messages nobody has opened yet. */
    unreadCount: integer("unread_count").notNull().default(0),
    status: text("status").notNull().default("open").$type<InboxThreadStatus>(),
    /** Which user picked this conversation up. Null = nobody yet. */
    assignedUserId: text("assigned_user_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_inbox_threads_contact_channel").on(t.contactId, t.channel),
    index("idx_inbox_threads_recent").on(t.status, t.lastMessageAt),
  ],
);

/**
 * One message. `externalId` is the provider's own id (Twilio MessageSid,
 * SendGrid message id) and is UNIQUE where present: both providers retry
 * webhook deliveries, and a retry must not become a second copy of what the
 * patient said.
 */
export const inboxMessages = sqliteTable(
  "inbox_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    contactId: text("contact_id").notNull(),
    direction: text("direction").notNull().$type<InboxDirection>(),
    channel: text("channel").notNull().$type<InboxChannel>(),
    subject: text("subject").notNull().default(""),
    /** Plain text — what the list preview and the AI draft read. Always populated. */
    body: text("body").notNull(),
    /** Original HTML for e-mail, so a rich reply isn't flattened on the way in. */
    html: text("html"),
    /** "form" | "survey" | "sms" | "email" | "agent" | "manual" — who or what produced it. */
    source: text("source").notNull(),
    externalId: text("external_id").unique(),
    /** Set for replies sent by a human from the inbox; null for agent/collector rows. */
    sentByUserId: text("sent_by_user_id"),
    /** Tracking token of the outbound e-mail, linking a reply to its opens and clicks. */
    sendToken: text("send_token"),
    createdAt: integer("created_at").notNull(),
    readAt: integer("read_at"),
  },
  (t) => [index("idx_inbox_messages_thread").on(t.threadId, t.createdAt)],
);

/**
 * Secret for the inbound e-mail webhook. Twilio signs its requests with the
 * auth token we already hold, so inbound SMS needs nothing stored here —
 * SendGrid Inbound Parse signs nothing at all, so the only thing standing
 * between that endpoint and the open internet is an unguessable path segment.
 */
export const inboxWebhookSettings = sqliteTable("inbox_webhook_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  emailSecret: text("email_secret").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * AI Copilot conversation log, kept for 7 days.
 *
 * Short retention on purpose: these transcripts quote patient data pulled by
 * the read-only tools, so they are a copy of the record with none of its
 * lifecycle. Long enough to pick up yesterday's thread, short enough not to
 * become a second, unmanaged patient database. Purged by the supervisor sweep
 * alongside the engine's operational tables.
 *
 * Note this stores the conversation, not knowledge — the model learns nothing
 * from it. Corrections worth keeping go to `knowledge_entries`.
 */
export const copilotMessages = sqliteTable(
  "copilot_messages",
  {
    id: text("id").primaryKey(),
    /** Groups turns into one thread; generated client-side when a chat starts. */
    conversationId: text("conversation_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().$type<"user" | "assistant">(),
    text: text("text").notNull(),
    /** Read-only tools consulted for this answer, so the transcript shows what it stood on. */
    tools: text("tools", { mode: "json" }).$type<string[]>(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsd: real("cost_usd"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_copilot_conversation").on(t.conversationId, t.createdAt),
    index("idx_copilot_user_recent").on(t.userId, t.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type EmailSettings = typeof emailSettings.$inferSelect;
export type SmsSettings = typeof smsSettings.$inferSelect;
export type SmsSenderRow = typeof smsSenders.$inferSelect;
export type LeadWebhookSettings = typeof leadWebhookSettings.$inferSelect;
export type PopupSettings = typeof popupSettings.$inferSelect;
export type PopupEvent = typeof popupEvents.$inferSelect;
export type ContactStatusRow = typeof contactStatuses.$inferSelect;
export type FeedRow = typeof feeds.$inferSelect;
export type FeedDataRow = typeof feedRows.$inferSelect;
export type UserTotp = typeof userTotp.$inferSelect;
export type ContentItemRow = typeof contentItems.$inferSelect;
export type MediaFileRow = typeof mediaFiles.$inferSelect;
export type TrackingPing = typeof trackingPings.$inferSelect;
export type FunnelRow = typeof funnels.$inferSelect;
/**
 * Lekarze i specjaliści placówki.
 *
 * `systemId` is the doctor's ID in the clinic's booking system — the provider
 * is asked about schedules by it, and visits are matched to doctors by it. Nazwa i specjalizacja są edytowalne, bo to
 * one pokazują się w module; `specKey` trzyma specjalizację złożoną do
 * porównywania (arkusz źródłowy miał „Chirurg Ogólny" i „Chirurg ogólny"
 * obok siebie, a to jeden zespół, nie dwa).
 */
export const doctors = sqliteTable(
  "doctors",
  {
    id: text("id").primaryKey(),
    systemId: integer("ic_id").notNull().unique(),
    name: text("name").notNull(),
    specialization: text("specialization").notNull().default(""),
    specKey: text("spec_key").notNull().default(""),
    /** Services: `[{ id, name }]` — `id` is the booking system's service ID. */
    services: text("services", { mode: "json" })
      .$type<{ id: number; name: string }[]>()
      .notNull()
      .default([]),
    bookingUrl: text("booking_url").notNull().default(""),
    active: integer("active").notNull().default(1),
    /**
     * Obłożenie z ostatniej synchronizacji — pojemność grafiku i liczba zajętych
     * terminów w miesiącu `slotsMonth`.
     *
     * Zapisane, a nie liczone przy każdym wejściu na listę: policzenie ich
     * wymaga jednego zapytania do systemu rezerwacji **na lekarza**, czyli 80 zapytań i kilku
     * megabajtów na otwarcie ekranu. Ekran mówi wprost, z której chwili są dane.
     */
    slotsCapacity: integer("slots_capacity").notNull().default(0),
    slotsBooked: integer("slots_booked").notNull().default(0),
    slotsMonth: text("slots_month").notNull().default(""),
    slotsSyncedAt: integer("slots_synced_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("idx_doctors_spec").on(t.specKey)],
);

export type DoctorRow = typeof doctors.$inferSelect;

export type ContactFunnelProgressRow = typeof contactFunnelProgress.$inferSelect;
export type EmailSendRow = typeof emailSends.$inferSelect;
export type EmailEventRow = typeof emailEvents.$inferSelect;
export type AutomationRow = typeof automations.$inferSelect;
export type ContactRow = typeof contacts.$inferSelect;
export type ContactNoteRow = typeof contactNotes.$inferSelect;
export type EngineEventRow = typeof engineEvents.$inferSelect;
export type AutomationRunRow = typeof automationRuns.$inferSelect;
export type EngineJobRow = typeof engineJobs.$inferSelect;
export type EngineLogRow = typeof engineLog.$inferSelect;
export type ContentSnapshotRow = typeof contentSnapshots.$inferSelect;
export type PopupQueueRow = typeof popupQueue.$inferSelect;
export type AgentInsightRow = typeof agentInsights.$inferSelect;
export type EngineSettingsRow = typeof engineSettings.$inferSelect;
export type AiSettingsRow = typeof aiSettings.$inferSelect;
export type KnowledgeEntryRow = typeof knowledgeEntries.$inferSelect;
export type InboxThreadRow = typeof inboxThreads.$inferSelect;
export type InboxMessageRow = typeof inboxMessages.$inferSelect;
export type InboxWebhookSettingsRow = typeof inboxWebhookSettings.$inferSelect;
export type CopilotMessageRow = typeof copilotMessages.$inferSelect;
export type ConsentDefRow = typeof consentDefs.$inferSelect;
/**
 * Własne raporty — zbudowane przez placówkę z kafelków (Raporty → Własne raporty).
 *
 * `definition` to wyłącznie klucze z katalogu `reports/custom/catalog.ts`:
 * źródło, miary, wymiary, filtry i układ kafelków. Żadnego SQL-a — zapytanie
 * składa serwer przy każdym otwarciu, więc raport zawsze liczy się z bieżących
 * danych, a zmiana katalogu nie zostawia w bazie przestarzałych zapytań.
 *
 * Raporty są **wspólne dla placówki**: widzą je wszyscy użytkownicy, konto
 * podglądu może je otwierać, ale nie tworzy ani nie zmienia.
 */
export const customReports = sqliteTable("custom_reports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  definition: text("definition", { mode: "json" }).notNull().$type<ReportDefinition>(),
  createdBy: text("created_by").notNull().default(""),
  updatedBy: text("updated_by").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Dane dostępowe integracji ustawiane w panelu.
 *
 * Wartość wyłącznie zaszyfrowana (`src/lib/credentials/crypto.server.ts`),
 * kluczem głównym z `.env`. `hint` to jedyna jawna pochodna: 4 ostatnie znaki
 * sekretu albo cała wartość pola jawnego (identyfikator, adres) — patrz
 * `credentialHint`. Brak wiersza = system czyta tę samą nazwę z `.env`.
 */
export const integrationCredentials = sqliteTable("integration_credentials", {
  /** Nazwa zmiennej, np. `SENDGRID_API_KEY` — lista w `credentials/catalog.ts`. */
  name: text("name").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  /** Skrót klucza głównego, którym zaszyfrowano — nie sekret. */
  keyId: text("key_id").notNull(),
  hint: text("hint").notNull().default(""),
  /** Imię i nazwisko osoby, która zmieniła — do podpisu w panelu. */
  updatedBy: text("updated_by").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

export type CustomReportRow = typeof customReports.$inferSelect;
export type ContactConsentRow = typeof contactConsents.$inferSelect;
export type ContactFieldDefRow = typeof contactFieldDefs.$inferSelect;
export type ContactVisitRow = typeof contactVisits.$inferSelect;
export type SegmentRow = typeof segments.$inferSelect;
export type IntegrationCredentialRow = typeof integrationCredentials.$inferSelect;
