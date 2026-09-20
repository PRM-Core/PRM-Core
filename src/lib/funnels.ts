import type { FunnelRow, FunnelStageRow } from "./db/schema";
import { t, localized } from "@/lib/i18n";

export type FunnelStage = FunnelStageRow;
export type Funnel = FunnelRow;

export interface ContactFunnelProgress {
  funnelId: string;
  stageIndex: number;
}

export const seedFunnels: Funnel[] = localized(() => [
  {
    id: "laryngologia",
    name: "Pacjent Laryngologiczny",
    updatedAt: "2026-05-02",
    stages: [
      { id: "lead", label: t("Lead"), description: t("Nowe zapytanie ws. konsultacji ENT") },
      { id: "contacted", label: t("Kontakt"), description: t("Recepcja wykonała telefon") },
      { id: "consult", label: t("Konsultacja"), description: t("Pierwsza wizyta u laryngologa") },
      { id: "diagnostics", label: t("Diagnostyka"), description: t("Audiometria / badania") },
      { id: "treatment", label: t("Leczenie"), description: t("Plan leczenia w toku") },
    ],
  },
  {
    id: "kosmetologia",
    name: "Pacjent Kosmetologia",
    updatedAt: "2026-05-02",
    stages: [
      { id: "lead", label: t("Lead"), description: t("Zapytanie z reklamy / formularza") },
      { id: "consult", label: t("Konsultacja"), description: t("Wizyta wstępna i wycena") },
      { id: "treatment", label: t("Zabieg"), description: t("Pierwszy zabieg wykonany") },
      { id: "followup", label: t("Kontrola"), description: t("Wizyta kontrolna po zabiegu") },
      { id: "loyal", label: t("Stały klient"), description: t("Powracający na kolejne zabiegi") },
    ],
  },
  {
    id: "implant",
    name: t("Potencjalny pacjent — implant słuchowy"),
    updatedAt: "2026-05-02",
    stages: [
      { id: "lead", label: t("Lead"), description: t("Wstępne zainteresowanie implantem") },
      { id: "qualified", label: t("Kwalifikacja"), description: t("Wywiad i wstępna ocena") },
      { id: "diagnostics", label: t("Diagnostyka"), description: t("Pełne badania słuchu") },
      { id: "decision", label: t("Decyzja"), description: t("Konsultacja chirurgiczna") },
      {
        id: "implant",
        label: t("Wszczepienie"),
        description: t("Pacjent zakwalifikowany / po zabiegu"),
      },
    ],
  },
]);

export function makeFunnelId(): string {
  return `funnel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function makeStageId(): string {
  return `stage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
