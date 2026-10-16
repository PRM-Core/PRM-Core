import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";
import { getDemoStatus, type DemoStatus } from "@/lib/api/demo.functions";
import { t } from "@/lib/i18n";

/**
 * Above every page of a demo installation (`PRM_DEMO=1`): the data is
 * simulated, nothing is sent, and here is what would have been. Renders
 * nothing anywhere else.
 */
export function DemoBanner() {
  const [status, setStatus] = useState<DemoStatus | null>(null);

  useEffect(() => {
    void getDemoStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status?.demo) return null;

  return (
    <div
      role="note"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm md:px-6 lg:px-8"
    >
      <FlaskConical className="h-4 w-4 shrink-0 text-amber-600" />
      <span className="font-medium">{t("Wersja demonstracyjna — dane symulowane")}</span>
      <span className="text-muted-foreground">
        {t(
          "Pacjenci są fikcyjni, a wiadomości nie wychodzą do nikogo. Dane wracają do stanu początkowego codziennie o {hour}:00.",
          { hour: status.resetHour },
        )}
      </span>
      <Link to="/demo" className="font-medium underline underline-offset-2">
        {t("Zobacz, co system by wysłał")}
      </Link>
    </div>
  );
}
