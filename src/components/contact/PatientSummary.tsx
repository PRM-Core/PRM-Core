import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getPatientSummary } from "@/lib/api/agent.functions";
import { t } from "@/lib/i18n";

/**
 * The patient in three sentences — visits, what is ahead, correspondence —
 * for whoever is about to call or reply. From the record only, no model.
 */
export function PatientSummary({
  contactId,
  className = "",
}: {
  contactId: string;
  className?: string;
}) {
  const [lines, setLines] = useState<string[] | null | undefined>(undefined);
  useEffect(() => {
    setLines(undefined);
    getPatientSummary({ data: { contactId } })
      .then(setLines)
      .catch(() => setLines(null));
  }, [contactId]);

  if (lines === undefined)
    return (
      <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Wczytywanie…")}
      </div>
    );
  if (!lines) return null;
  return (
    <div className={`space-y-0.5 text-xs leading-snug ${className}`}>
      {lines.map((line, i) => (
        <p key={i} className={i === 0 ? "" : "text-muted-foreground"}>
          {line}
        </p>
      ))}
    </div>
  );
}
