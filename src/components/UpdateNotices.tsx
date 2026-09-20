import { useEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { ArrowUpCircle, Info, ShieldAlert, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissUpdateNotice, getUpdateNotices } from "@/lib/api/updates.functions";
import type { Notice } from "@/lib/updates/feed";
import { t } from "@/lib/i18n";

const STYLE: Record<Notice["level"], string> = {
  update: "border-primary/30 bg-primary/5",
  info: "border-border bg-muted/40",
  important: "border-amber-500/40 bg-amber-500/5",
  security: "border-destructive/40 bg-destructive/5",
};

function Icon({ level }: { level: Notice["level"] }) {
  const cls = "h-4 w-4 mt-0.5 shrink-0";
  if (level === "update") return <ArrowUpCircle className={`${cls} text-primary`} />;
  if (level === "security") return <ShieldAlert className={`${cls} text-destructive`} />;
  if (level === "important") return <AlertTriangle className={`${cls} text-amber-600`} />;
  return <Info className={`${cls} text-muted-foreground`} />;
}

/**
 * Notices from the PRM Core owner (new version, important information) —
 * for administrators, above every page until dismissed. Plain text only:
 * the feed comes from the network and is not trusted to carry markup.
 */
export function UpdateNotices() {
  const { user } = useRouteContext({ from: "__root__" });
  const [notices, setNotices] = useState<Notice[]>([]);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    void getUpdateNotices()
      .then(setNotices)
      .catch(() => setNotices([]));
  }, [isAdmin]);

  if (!isAdmin || notices.length === 0) return null;

  const dismiss = (id: string) => {
    setNotices((all) => all.filter((n) => n.id !== id));
    void dismissUpdateNotice({ data: { id } });
  };

  return (
    <div className="space-y-2 px-4 pt-4 md:px-6 lg:px-8">
      {notices.map((n) => (
        <div
          key={n.id}
          role="status"
          className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${STYLE[n.level]}`}
        >
          <Icon level={n.level} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {n.level === "update"
                ? t("Dostępna jest nowa wersja PRM Core: {version}", { version: n.title })
                : n.title}
            </p>
            {n.body && <p className="text-muted-foreground">{n.body}</p>}
            {n.url && (
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline underline-offset-2"
              >
                {n.level === "update" ? t("Co nowego i jak zaktualizować") : t("Szczegóły")}
              </a>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title={t("Ukryj")}
            aria-label={t("Ukryj")}
            onClick={() => dismiss(n.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
