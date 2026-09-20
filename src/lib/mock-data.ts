export type ActivityType =
  | "signup"
  | "sms"
  | "email"
  | "open"
  | "click"
  | "visit"
  | "note"
  | "page_visit";

export interface Activity {
  id: string;
  contactId: string;
  type: ActivityType;
  title: string;
  description: string;
  date: string;
}

export const activities: Activity[] = [
  {
    id: "a9",
    contactId: "1",
    type: "page_visit",
    title: "Wszedł na stronę: /rejestracja/kardiologia",
    description: "Sesja rozpoznana po kliknięciu w link z kampanii „Kardio Q2 2026” (e-mail)",
    date: "2026-05-25 09:12",
  },
  {
    id: "a8",
    contactId: "1",
    type: "page_visit",
    title: "Wszedł na stronę: /blog/dbaj-o-serce-zima",
    description:
      "Odwiedziny na podstawie zapisanego identyfikatora przeglądarki (anonimowo, później rozpoznany)",
    date: "2026-05-25 09:03",
  },
  {
    id: "a1",
    contactId: "1",
    type: "visit",
    title: "Wizyta u kardiologa",
    description: "Dr Nowak — kontrola",
    date: "2026-05-24 10:30",
  },
  {
    id: "a2",
    contactId: "1",
    type: "email",
    title: "Wysłano email",
    description: "Przypomnienie o wizycie",
    date: "2026-05-22 09:15",
  },
  {
    id: "a3",
    contactId: "1",
    type: "open",
    title: "Otwarto wiadomość",
    description: "Newsletter: zdrowie serca",
    date: "2026-05-20 18:42",
  },
  {
    id: "a4",
    contactId: "1",
    type: "sms",
    title: "Wysłano SMS",
    description: "Potwierdzenie wizyty",
    date: "2026-05-19 12:00",
  },
  {
    id: "a5",
    contactId: "1",
    type: "click",
    title: "Kliknięcie w kampanię",
    description: "Kardio Q1 2026",
    date: "2026-05-15 14:21",
  },
  {
    id: "a6",
    contactId: "1",
    type: "signup",
    title: "Rejestracja do specjalisty",
    description: "Kardiolog — wizyta pierwszorazowa",
    date: "2026-04-12 11:00",
  },
  {
    id: "a7",
    contactId: "1",
    type: "note",
    title: "Notatka",
    description: "Pacjent prosi o kontakt mailowy",
    date: "2026-04-12 11:05",
  },
];
