import { t } from "@/lib/i18n";

/** The factor names of the model, as a receptionist reads them. */
export function factorLabel(feature: string, raises: boolean): string {
  const labels: Record<string, [string, string]> = {
    leadDaysLog: [t("umówiona z dużym wyprzedzeniem"), t("umówiona niedawno")],
    earlyMorning: [t("wczesna pora"), t("nie wczesna pora")],
    lateAfternoon: [t("późne popołudnie"), t("nie późne popołudnie")],
    monday: [t("poniedziałek"), t("nie poniedziałek")],
    friday: [t("piątek"), t("nie piątek")],
    firstVisit: [t("pierwsza wizyta"), t("pacjent już był")],
    priorNoShowRate: [t("wcześniejsze nieobecności"), t("dotąd zawsze przychodził")],
    priorNoShows: [t("wcześniejsze nieobecności"), t("bez wcześniejszych nieobecności")],
    bookedOnline: [t("rezerwacja online"), t("umówiona przez rejestrację")],
    noPhone: [t("brak telefonu"), t("jest telefon")],
    noSmsConsent: [t("bez zgody na SMS"), t("zgoda na SMS")],
    newInBase: [t("nowy kontakt"), t("kontakt od dawna w bazie")],
  };
  const pair = labels[feature];
  if (!pair) return feature;
  return raises ? pair[0] : pair[1];
}
