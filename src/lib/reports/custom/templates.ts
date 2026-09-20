import type { ReportDefinition, ReportWidget } from "./catalog";
import { t, localized } from "@/lib/i18n";

/**
 * Szablony startowe dla „Nowy raport". Punkt wyjścia do przerobienia, nie
 * gotowe raporty — po wybraniu lądują w kreatorze jak każdy inny układ.
 */

let seq = 0;
function w(
  p: Omit<ReportWidget, "id" | "title" | "filters" | "limit"> & Partial<ReportWidget>,
): ReportWidget {
  return { id: `szablon-${++seq}`, title: "", filters: [], limit: 10, ...p };
}

export interface ReportTemplate {
  key: string;
  name: string;
  description: string;
  build: () => ReportDefinition;
}

export const REPORT_TEMPLATES: ReportTemplate[] = localized(() => [
  {
    key: "empty",
    name: "Pusty raport",
    description: t("Zaczynasz od czystej kartki i przeciągasz kafelki z palety."),
    build: () => ({ range: { preset: "30", from: "", to: "" }, widgets: [] }),
  },
  {
    key: "marketing",
    name: t("Marketing i leady"),
    description: t("Nowe kontakty, ich źródła i skuteczność e-maili."),
    build: () => ({
      range: { preset: "30", from: "", to: "" },
      widgets: [
        w({
          type: "kpi",
          width: "half",
          source: "contacts",
          measures: ["count"],
          dimensions: [],
          title: t("Nowe kontakty"),
        }),
        w({
          type: "kpi",
          width: "half",
          source: "emails",
          measures: ["open_rate"],
          dimensions: [],
        }),
        w({
          type: "line",
          width: "full",
          source: "contacts",
          measures: ["count"],
          dimensions: ["day", "status"],
        }),
        w({
          type: "bar",
          width: "half",
          source: "contacts",
          measures: ["count"],
          dimensions: ["source"],
        }),
        w({
          type: "bar",
          width: "half",
          source: "contacts",
          measures: ["count"],
          dimensions: ["campaign"],
        }),
        w({
          type: "table",
          width: "full",
          source: "emails",
          measures: ["sent", "opened", "open_rate", "clicked"],
          dimensions: ["template"],
        }),
      ],
    }),
  },
  {
    key: "visits",
    name: t("Wizyty i przychód"),
    description: t("Liczba wizyt w czasie, przychód według specjalizacji i lekarzy."),
    build: () => ({
      range: { preset: "90", from: "", to: "" },
      widgets: [
        w({ type: "kpi", width: "half", source: "visits", measures: ["count"], dimensions: [] }),
        w({ type: "kpi", width: "half", source: "visits", measures: ["revenue"], dimensions: [] }),
        w({
          type: "line",
          width: "full",
          source: "visits",
          measures: ["count"],
          dimensions: ["week"],
        }),
        w({
          type: "bar",
          width: "half",
          source: "visits",
          measures: ["revenue"],
          dimensions: ["specialization"],
        }),
        w({
          type: "bar",
          width: "half",
          source: "visits",
          measures: ["patients"],
          dimensions: ["specialization"],
        }),
        w({
          type: "table",
          width: "full",
          source: "visits",
          measures: ["count", "patients", "revenue", "avg_price"],
          dimensions: ["doctor"],
          limit: 25,
        }),
      ],
    }),
  },
]);
