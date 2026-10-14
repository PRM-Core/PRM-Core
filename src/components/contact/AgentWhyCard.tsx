import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Compass, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAgentForContact } from "@/lib/api/agent.functions";
import { PatientSummary } from "@/components/contact/PatientSummary";
import { OWNER_LABELS, TOPIC_LABELS, URGENCY_LABELS } from "@/lib/agent/triage";
import type { TriageOwner, TriageTopic, TriageUrgency } from "@/lib/db/schema";
import { intlLocale, localized, t } from "@/lib/i18n";

/**
 * PRM_Agent on the patient's card: what the agent holds about this patient
 * and why — the lists they are on today, the no-show risk with its factors,
 * the messages and drafts that name them, how their conversations were
 * triaged, and the agent's log about them. Read from the installation's own
 * database; no model involved.
 */

type Explanation = Awaited<ReturnType<typeof getAgentForContact>>;

const LIST_LABELS: Record<string, string> = localized(() => ({
  recall_due: t("Recall do zrobienia"),
  first_visit_no_followup: t("Pierwsza wizyta bez kolejnej"),
  post_visit_no_reply: t("Po wizycie, bez odpowiedzi"),
  drifting: t("Pacjenci dryfujący"),
  high_risk: t("Wizyty zagrożone nieobecnością"),
  no_phone: t("Bez telefonu"),
}));

const DRAFT_STATUS: Record<string, string> = localized(() => ({
  proposed: t("Czeka na decyzję"),
  approved: t("Zatwierdzony"),
  handed_off: t("Przekazany do wysyłki"),
  rejected: t("Odrzucony"),
}));

const ACTOR: Record<string, string> = localized(() => ({
  person: t("Osoba"),
  agent: t("Agent"),
  model: t("Model"),
}));

function when(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(intlLocale(), {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AgentWhyCard({ contactId }: { contactId: string }) {
  const [data, setData] = useState<Explanation | null>(null);
  useEffect(() => {
    getAgentForContact({ data: { contactId } })
      .then(setData)
      .catch(() =>
        setData({ lists: [], risks: [], messages: [], triage: [], log: [] } as Explanation),
      );
  }, [contactId]);

  const empty =
    data &&
    data.lists.length === 0 &&
    data.risks.length === 0 &&
    data.messages.length === 0 &&
    data.triage.length === 0 &&
    data.log.length === 0;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />{" "}
          {t("Co agent wie o tym pacjencie — i dlaczego")}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          {t(
            "Z liczb tej instalacji, bez modelu: listy, na których pacjent jest dziś, ryzyko nieobecności z czynnikami, wiadomości i drafty, ocena rozmów, wpisy agenta.",
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Section title={t("W trzech zdaniach")}>
          <li>
            <PatientSummary contactId={contactId} className="text-sm" />
          </li>
        </Section>
        {!data ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Wczytywanie…")}
          </div>
        ) : empty ? (
          <p className="text-muted-foreground">
            {t("Poza tym nic: pacjent nie jest dziś na żadnej liście, nie ma ryzyk ani draftów.")}
          </p>
        ) : (
          <>
            {data.lists.length > 0 && (
              <Section title={t("Listy dla rejestracji")}>
                {data.lists.map((l) => (
                  <Row key={l.key}>
                    <Link
                      to="/agent"
                      search={{ tab: "lists", list: l.key }}
                      className="font-medium text-primary hover:underline"
                    >
                      {LIST_LABELS[l.key] ?? l.key}
                    </Link>{" "}
                    <span className="text-muted-foreground">— {l.reason}</span>
                  </Row>
                ))}
              </Section>
            )}
            {data.risks.length > 0 && (
              <Section title={t("Ryzyko nieobecności")}>
                {data.risks.map((r) => (
                  <Row key={r.visitId}>
                    <span className="font-medium">{r.title || t("Wizyta")}</span>{" "}
                    <span className="text-muted-foreground">— {r.reason}</span>
                  </Row>
                ))}
              </Section>
            )}
            {data.messages.length > 0 && (
              <Section title={t("Wiadomości i drafty")}>
                {data.messages.map((m) => (
                  <Row key={m.id}>
                    <Link
                      to="/agent"
                      search={{ tab: "drafts" }}
                      className="font-medium text-primary hover:underline"
                    >
                      {m.title}
                    </Link>{" "}
                    <Badge variant="secondary" className="font-normal">
                      {DRAFT_STATUS[m.status] ?? m.status}
                    </Badge>{" "}
                    <span className="text-muted-foreground text-xs">
                      {m.decidedBy ? `${m.decidedBy} · ` : ""}
                      {when(m.updatedAt)}
                    </span>
                  </Row>
                ))}
              </Section>
            )}
            {data.triage.length > 0 && (
              <Section title={t("Ocena rozmów")}>
                {data.triage.map((th) => (
                  <Row key={th.threadId}>
                    <Link
                      to="/inbox"
                      search={{ thread: th.threadId }}
                      className="font-medium text-primary hover:underline"
                    >
                      {th.channel}
                    </Link>{" "}
                    <span>
                      {URGENCY_LABELS[th.urgency as TriageUrgency] ?? th.urgency}
                      {th.topic ? ` · ${TOPIC_LABELS[th.topic as TriageTopic] ?? th.topic}` : ""}
                      {th.owner ? ` → ${OWNER_LABELS[th.owner as TriageOwner] ?? th.owner}` : ""}
                    </span>{" "}
                    <span className="text-muted-foreground">— {th.reason}</span>
                  </Row>
                ))}
              </Section>
            )}
            {data.log.length > 0 && (
              <Section title={t("Wpisy agenta")}>
                {data.log.slice(0, 10).map((e) => (
                  <Row key={e.id}>
                    <span className="text-[11px] text-muted-foreground">{when(e.createdAt)}</span>{" "}
                    <Badge variant="secondary" className="font-normal">
                      {ACTOR[e.actor] ?? e.actor}
                    </Badge>{" "}
                    {e.message}
                  </Row>
                ))}
              </Section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <li className="leading-snug">{children}</li>;
}
