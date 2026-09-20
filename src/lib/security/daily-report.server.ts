import process from "node:process";
import { and, eq, gte, like, or } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { emailSettings, engineLog } from "../db/schema";
import { sendEmail } from "../email/sendgrid.server";
import { logStep } from "../engine/log.server";
import { getAiConfig, getKeyStatus } from "../ai/settings.server";
import { priceCall, type AiToolDef } from "../ai/provider.server";
import { warsawDay, warsawMinuteOfDay } from "../visits/warsaw-time";
import { readAccessLog, summarise, type AccessSummary } from "./access-log.server";
import { collectSecuritySnapshot, type SecuritySnapshot } from "./checks.server";
import { opisPlacowki, withOrgName } from "../config.server";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Dobowy raport bezpieczeństwa PRM_Agenta.
 *
 * Adres z `PRM_SECURITY_REPORT_TO`, **7:00** czasu
 * warszawskiego, **codziennie** — także wtedy, gdy nic się nie stało.
 *
 * **Dlaczego codziennie, a nie tylko przy problemach.** Raport wysyłany wyłącznie
 * przy incydencie uczy, że brak wiadomości znaczy „wszystko dobrze". A znaczy też
 * „silnik stanął", „skończył się limit modelu" i „serwer nie żyje" — czyli
 * dokładnie te sytuacje, o których trzeba wiedzieć najbardziej.
 *
 * **Podział ról jest sztywny**: liczy `checks.server.ts` i `access-log.server.ts`,
 * model wyłącznie interpretuje gotowe liczby. Nigdy odwrotnie.
 */

/**
 * Bez wartości domyślnej — celowo. Adres odbiorcy to dane konkretnej osoby;
 * zaszyty w kodzie jechał z każdą kopią repozytorium i groził tym, że nowa
 * instalacja wyśle swój raport bezpieczeństwa pod cudzy adres. Brak wpisu
 * w `.env` znaczy „nie wysyłaj” i jest zgłaszany w logu, nie po cichu.
 */
function odbiorca(): string {
  return (process.env.PRM_SECURITY_REPORT_TO ?? "").trim();
}

function temat(): string {
  return withOrgName(t("Analiza bezpieczeństwa PRM Core"), " / ");
}
const GODZINA = Number(process.env.PRM_SECURITY_REPORT_HOUR ?? 7);

/**
 * Własny budżet dobowy — 5 USD.
 *
 * Osobny od ogólnego limitu PRM_Agenta, żeby raport nie konkurował
 * z rekomendacjami pod raportami wysyłek: jedno drogie popołudnie w kampaniach
 * nie może skasować porannego raportu bezpieczeństwa ani odwrotnie.
 */
const LIMIT_USD = Number(process.env.PRM_SECURITY_REPORT_LIMIT_USD ?? 5);
const ZNACZNIK = "raport-bezpieczenstwa";
const MAX_TOKENS = 1500;

const systemPrompt = () =>
  t(
    'Jesteś PRM_Agentem — analitykiem bezpieczeństwa systemu PRM Core,\nCRM-a medycznego {v0}. Dostajesz gotowe liczby z ostatniej doby.\n\nZASADY:\n- Nie licz niczego samodzielnie i nie poprawiaj podanych liczb. Zostały policzone\n  przez kod. Twoim zadaniem jest powiedzieć, co one znaczą.\n- Pisz po polsku, rzeczowo, bez straszenia i bez uspokajania na wyrost.\n- Odróżniaj rutynę od sygnału: pojedyncze 404 to internetowy szum, seria żądań\n  pod te same zamknięte adresy z jednej sieci to skanowanie, a blokada logowania\n  na koncie pracownika to najczęściej zapomniane hasło, nie włamanie.\n- Gdy nie wiadomo, powiedz „nie wiadomo" i napisz, co by to rozstrzygnęło.\n- Nie proponuj blokowania adresów IP automatycznie.\n- Nie wymyślaj zdarzeń, których nie ma w danych.\n\nZgłoś wynik wywołaniem narzędzia "raport_bezpieczenstwa" — dokładnie raz.',
    { v0: opisPlacowki() },
  );

/**
 * Narzędzie zamiast proszenia o „sam JSON". Model proszony o surowy JSON lubi
 * dokleić zdanie wstępu, a wtedy odpowiedź trzeba ratować szukaniem nawiasów.
 * Schemat wymusza kształt po stronie dostawcy.
 */
function buildTool(): AiToolDef {
  return {
    name: "raport_bezpieczenstwa",
    description: t(
      "Zgłasza omówienie stanu bezpieczeństwa z ostatniej doby. Wywołaj dokładnie raz.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        jednymZdaniem: {
          type: "string",
          description: t("Jedno zdanie do tematu wiadomości, do 120 znaków."),
        },
        omowienie: {
          type: "string",
          description: t("2-5 zdań: co się działo i co to znaczy."),
        },
        doZrobienia: {
          type: "array",
          maxItems: 6,
          items: { type: "string" },
          description: t("Konkretne kroki. Pusta tablica, gdy nic nie trzeba robić."),
        },
      },
      required: ["jednymZdaniem", "omowienie", "doZrobienia"],
    },
  };
}

interface Ocena {
  werdykt: "spokojnie" | "do obejrzenia" | "pilne";
  jednymZdaniem: string;
  omowienie: string;
  doZrobienia: string[];
}

/** Wydatek na sam raport od północy — własny licznik, niezależny od ogólnego. */
async function wydanoDzis(): Promise<number> {
  const polnoc = new Date();
  polnoc.setHours(0, 0, 0, 0);
  const db = getDb();
  const rows = await db
    .select({ costUsd: engineLog.costUsd })
    .from(engineLog)
    .where(
      and(
        eq(engineLog.kind, "ai"),
        like(engineLog.message, `%${ZNACZNIK}%`),
        gte(engineLog.createdAt, polnoc.getTime()),
      ),
    );
  return rows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
}

/**
 * Werdykt wyliczony bez modelu — używany, gdy modelu nie ma albo się nie udał.
 * Raport ma wyjść **zawsze**; brak modelu obniża jakość omówienia, nie kasuje
 * wiadomości.
 */
function werdyktZLiczb(snapshot: SecuritySnapshot, ruch: AccessSummary): Ocena {
  const nieudane = snapshot.checks.filter((c) => !c.ok);
  const wyciek = nieudane.some(
    (c) => c.szczegol.includes("WYCIEK") || c.szczegol.includes("BEZ LOGOWANIA"),
  );

  const doZrobienia = nieudane.map((c) => `${c.nazwa}: ${c.szczegol}`);
  if (ruch.suspicious.length > 0) {
    doZrobienia.push(
      t("Obejrzeć ruch z {length} sieci, które dostały najwięcej odmów.", {
        length: ruch.suspicious.length,
      }),
    );
  }

  const werdykt: Ocena["werdykt"] = wyciek
    ? "pilne"
    : nieudane.length > 0
      ? "do obejrzenia"
      : "spokojnie";
  return {
    werdykt,
    jednymZdaniem:
      werdykt === "spokojnie"
        ? t("Wszystkie sprawdzenia przeszły.")
        : t("{length} sprawdzeń nie przeszło.", { length: nieudane.length }),
    omowienie:
      t("Omówienie bez udziału modelu — poniżej same liczby. ") +
      t("W ostatniej dobie: {total} żądań, {notFound} odmów 404, ", {
        total: ruch.total,
        notFound: ruch.notFound,
      }) +
      `${snapshot.blokadyLogowania} blokad logowania.`,
    doZrobienia,
  };
}

async function ocenModelem(
  snapshot: SecuritySnapshot,
  ruch: AccessSummary,
): Promise<{ ocena: Ocena; modelUzyty: boolean; uwaga?: string }> {
  const config = await getAiConfig();
  if (!(await getKeyStatus())[config.providerId]) {
    return {
      ocena: werdyktZLiczb(snapshot, ruch),
      modelUzyty: false,
      uwaga: "Brak klucza dostawcy AI.",
    };
  }

  const wydano = await wydanoDzis();
  if (wydano >= LIMIT_USD) {
    return {
      ocena: werdyktZLiczb(snapshot, ruch),
      modelUzyty: false,
      uwaga: t("Własny limit raportu wyczerpany (${v0} / ${v1}).", {
        v0: wydano.toFixed(4),
        v1: LIMIT_USD.toFixed(2),
      }),
    };
  }

  try {
    const completion = await config.provider.complete({
      model: config.model,
      system: systemPrompt(),
      messages: [{ role: "user", text: JSON.stringify({ sprawdzenia: snapshot, ruch }, null, 1) }],
      tools: [buildTool()],
      maxTokens: MAX_TOKENS,
    });

    const costUsd = priceCall(config.providerId, config.model, completion.usage);
    await logStep({
      kind: "ai",
      message: t("PRM_Agent — {ZNACZNIK} (dobowa analiza).", { ZNACZNIK: ZNACZNIK }),
      detail: { feature: ZNACZNIK },
      tokensIn: completion.usage.inputTokens,
      tokensOut: completion.usage.outputTokens,
      costUsd,
    });

    const call = completion.toolCalls.find((c) => c.name === "raport_bezpieczenstwa");
    if (!call) throw new Error(t("Model nie wywołał narzędzia."));
    const parsed = call.input as Partial<Ocena>;

    const zapasowy = werdyktZLiczb(snapshot, ruch);
    return {
      ocena: {
        // **Werdykt bierzemy z liczb, nie od modelu.** Model opisuje; o tym, czy
        // coś jest pilne, decyduje wynik sprawdzeń — inaczej łagodne
        // sformułowanie mogłoby ukryć niezaliczony test.
        werdykt: zapasowy.werdykt,
        jednymZdaniem: parsed.jednymZdaniem?.slice(0, 160) || zapasowy.jednymZdaniem,
        omowienie: parsed.omowienie?.slice(0, 2000) || zapasowy.omowienie,
        doZrobienia: Array.isArray(parsed.doZrobienia)
          ? parsed.doZrobienia.slice(0, 8).map((x) => String(x).slice(0, 300))
          : zapasowy.doZrobienia,
      },
      modelUzyty: true,
    };
  } catch (err) {
    return {
      ocena: werdyktZLiczb(snapshot, ruch),
      modelUzyty: false,
      uwaga: t("Model nie odpowiedział: {v0}.", {
        v0: err instanceof Error ? err.message : t("błąd"),
      }),
    };
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const KOLORY = {
  spokojnie: "#0f7b4f",
  "do obejrzenia": "#b45309",
  pilne: "#b42318",
} as const;

/**
 * Treść wiadomości. **Tabele, nie flex ani grid** — Outlook renderuje pocztę
 * silnikiem Worda i układ oparty na nowoczesnym CSS rozjeżdża się tam całkowicie.
 */
export function renderReport(input: {
  snapshot: SecuritySnapshot;
  ruch: AccessSummary;
  ocena: Ocena;
  modelUzyty: boolean;
  uwaga?: string;
  dzien: string;
}): string {
  const { snapshot, ruch, ocena } = input;
  const kolor = KOLORY[ocena.werdykt];
  const nieudane = snapshot.checks.filter((c) => !c.ok);

  const wiersz = (l: string, p: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#475467;font-size:14px">${esc(l)}</td>` +
    `<td style="padding:6px 0;color:#101828;font-size:14px;font-weight:600">${esc(p)}</td></tr>`;

  const sprawdzenia = snapshot.checks
    .map(
      (c) =>
        `<tr><td style="padding:5px 10px 5px 0;font-size:14px">${c.ok ? "✔" : "✖"}</td>` +
        `<td style="padding:5px 12px 5px 0;font-size:14px;color:${c.ok ? "#101828" : "#b42318"}">${esc(c.nazwa)}</td>` +
        `<td style="padding:5px 0;font-size:13px;color:#475467">${esc(c.szczegol)}</td></tr>`,
    )
    .join("");

  const podejrzane = ruch.suspicious.length
    ? ruch.suspicious
        .map(
          (s) =>
            `<tr><td style="padding:5px 12px 5px 0;font-size:13px;font-family:monospace">${esc(s.network)}</td>` +
            t(
              '<td style="padding:5px 12px 5px 0;font-size:13px">{blocked} odmów / {requests} żądań</td>',
              { blocked: s.blocked, requests: s.requests },
            ) +
            `<td style="padding:5px 0;font-size:12px;color:#475467">${esc(s.paths.join(", ").slice(0, 160))}</td></tr>`,
        )
        .join("")
    : t(
        '<tr><td colspan="3" style="padding:5px 0;font-size:14px;color:#475467">Żadna sieć nie zebrała serii odmów.</td></tr>',
      );

  const kroki = ocena.doZrobienia.length
    ? `<ul style="margin:8px 0 0;padding-left:20px;color:#101828;font-size:14px">${ocena.doZrobienia
        .map((k) => `<li style="margin:4px 0">${esc(k)}</li>`)
        .join("")}</ul>`
    : t('<p style="margin:8px 0 0;color:#475467;font-size:14px">Nic nie wymaga działania.</p>');

  return t(
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;font-family:Arial,Helvetica,sans-serif">\n<tr><td align="center">\n<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e7ec;border-radius:12px;padding:28px">\n\n<tr><td style="padding-bottom:4px;color:#667085;font-size:13px">{v0} · {v1}</td></tr>\n<tr><td style="padding-bottom:16px;font-size:20px;font-weight:700;color:#101828">Analiza bezpieczeństwa</td></tr>\n\n<tr><td style="padding:14px 16px;background:{kolor}12;border-left:4px solid {kolor2};border-radius:6px">\n  <div style="color:{kolor22};font-size:15px;font-weight:700;text-transform:uppercase">{v5}</div>\n  <div style="margin-top:4px;color:#101828;font-size:15px">{v6}</div>\n</td></tr>\n\n<tr><td style="padding-top:20px;color:#101828;font-size:14px;line-height:1.55">{v7}</td></tr>\n\n<tr><td style="padding-top:22px;font-size:15px;font-weight:700;color:#101828">Do zrobienia</td></tr>\n<tr><td>{kroki}</td></tr>\n\n<tr><td style="padding-top:24px;font-size:15px;font-weight:700;color:#101828">Sprawdzenia ({v9}/{length})</td></tr>\n<tr><td><table cellpadding="0" cellspacing="0" style="margin-top:6px">{sprawdzenia}</table></td></tr>\n\n<tr><td style="padding-top:24px;font-size:15px;font-weight:700;color:#101828">Ruch z ostatniej doby</td></tr>\n<tr><td><table cellpadding="0" cellspacing="0" style="margin-top:6px">\n{v12}\n{v13}\n{v14}\n{v15}\n</table></td></tr>\n\n<tr><td style="padding-top:24px;font-size:15px;font-weight:700;color:#101828">Sieci z serią odmów</td></tr>\n<tr><td><table cellpadding="0" cellspacing="0" style="margin-top:6px">{podejrzane}</table></td></tr>\n\n<tr><td style="padding-top:26px;border-top:1px solid #e4e7ec;color:#667085;font-size:12px;line-height:1.6">\n  Adresy skrócone do sieci, a tokeny w ścieżkach usunięte — do analizy nie trafiają\n  dane pozwalające rozpoznać pacjenta. Logi kasują się po 30 dniach.<br>\n  {v17}\n</td></tr>\n\n</table></td></tr></table>',
    {
      v0: esc(withOrgName("PRM Core")),
      v1: esc(input.dzien),
      kolor: kolor,
      kolor2: kolor,
      kolor22: kolor,
      v5: esc(ocena.werdykt),
      v6: esc(ocena.jednymZdaniem),
      v7: esc(ocena.omowienie),
      kroki: kroki,
      v9: snapshot.checks.length - nieudane.length,
      length: snapshot.checks.length,
      sprawdzenia: sprawdzenia,
      v12: ruch.available
        ? wiersz(t("Żądań łącznie"), String(ruch.total)) +
          wiersz(t("Odmów 404"), String(ruch.notFound)) +
          wiersz(t("Błędów serwera (5xx)"), String(ruch.serverErrors)) +
          wiersz(t("Prób bez sesji na funkcjach serwerowych"), String(ruch.serverFnAnonymous)) +
          wiersz(t("Prób pod adresy MCP"), String(ruch.mcpAttempts))
        : `<tr><td colspan="2" style="padding:6px 0;font-size:14px;color:#b45309">${esc(ruch.note ?? t("Brak logów."))}</td></tr>`,
      v13: wiersz("Blokady logowania", String(snapshot.blokadyLogowania)),
      v14: wiersz("Aktywne sesje", String(snapshot.aktywneSesje)),
      v15: wiersz("Wersja na serwerze", snapshot.wersja),
      podejrzane: podejrzane,
      v17: input.modelUzyty
        ? t("Omówienie napisał PRM_Agent na podstawie policzonych liczb.")
        : t("Omówienie bez modelu. {v0}", { v0: esc(input.uwaga ?? "") }),
    },
  );
}

/** Złożenie raportu bez wysyłania — używane przy testach i podglądzie. */
export async function buildSecurityReport(
  now = Date.now(),
): Promise<{ subject: string; html: string; werdykt: string }> {
  const [{ entries, available, note }, snapshot] = await Promise.all([
    readAccessLog(24, now),
    collectSecuritySnapshot(now),
  ]);
  const ruch = summarise(entries, available, note);
  const { ocena, modelUzyty, uwaga } = await ocenModelem(snapshot, ruch);
  const dzien = new Date(now).toLocaleDateString(intlLocale(), {
    timeZone: "Europe/Warsaw",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return {
    // **Temat stały plus jedno słowo werdyktu.** Wklejanie całego zdania do
    // tematu daje wiersz, który klient pocztowy i tak utnie w połowie, a przy
    // przeglądaniu skrzynki liczy się jedno: czy dziś trzeba coś zrobić.
    // Zdanie zostaje w treści, na samej górze.
    subject: `${temat()} — ${ocena.werdykt}`,
    html: renderReport({ snapshot, ruch, ocena, modelUzyty, uwaga, dzien }),
    werdykt: ocena.werdykt,
  };
}

/**
 * Wywoływane z pętli silnika. Wysyła **raz na dobę, po 7:00** czasu warszawskiego.
 *
 * Znacznik „już wysłano" siedzi w dzienniku silnika, nie w pamięci procesu —
 * restart kontenera w środku dnia nie ma prawa spowodować drugiej wiadomości.
 */
export async function maybeSendSecurityReport(now = Date.now()): Promise<void> {
  if (warsawMinuteOfDay(now) < GODZINA * 60) return;

  const db = getDb();
  const dzis = warsawDay(now);
  const juz = await db
    .select({ id: engineLog.id })
    .from(engineLog)
    .where(
      and(
        // The message is translated, so the sent report is recognised by its
        // detail (`source` + `dzien`, written only on success). The message
        // match stays for rows written before the interface was translated.
        or(
          and(
            like(engineLog.detail, `%"source":"${ZNACZNIK}"%`),
            like(engineLog.detail, `%"dzien":"${dzis}"%`),
          ),
          like(engineLog.message, `%${ZNACZNIK}: wysłany za ${dzis}%`),
        ),
        gte(engineLog.createdAt, now - 36 * 60 * 60 * 1000),
      ),
    )
    .get();
  if (juz) return;

  // Przed modelem, nie po nim: raport bez odbiorcy i tak nie wyjdzie, a wywołanie
  // PRM_Agenta kosztuje. Milczące pominięcie byłoby gorsze od braku raportu —
  // dlatego wpis w logu.
  const adresat = odbiorca();
  if (!adresat) {
    await logStep({
      kind: "error",
      message: t("{ZNACZNIK}: brak PRM_SECURITY_REPORT_TO w .env — raport za {dzis} nie wyszedł.", {
        ZNACZNIK: ZNACZNIK,
        dzis: dzis,
      }),
      detail: { source: ZNACZNIK },
    });
    return;
  }

  const settings = await db.select().from(emailSettings).get();
  const from = settings?.fromEmail ?? "";
  if (!from) {
    await logStep({
      kind: "error",
      message: t("{ZNACZNIK}: brak adresu nadawcy — raport za {dzis} nie wyszedł.", {
        ZNACZNIK: ZNACZNIK,
        dzis: dzis,
      }),
      detail: { source: ZNACZNIK },
    });
    return;
  }

  const { subject, html, werdykt } = await buildSecurityReport(now);

  await sendEmail({
    to: adresat,
    fromEmail: from,
    fromName: settings?.fromName || "PRM Core",
    subject,
    html,
  });

  // Dopiero po wysłaniu. Znacznik postawiony wcześniej zjadłby raport, gdyby
  // SendGrid akurat nie odpowiedział — i nikt by się o tym nie dowiedział.
  await logStep({
    kind: "action",
    message: t("{ZNACZNIK}: wysłany za {dzis} do {adresat} (werdykt: {werdykt}).", {
      ZNACZNIK: ZNACZNIK,
      dzis: dzis,
      adresat: adresat,
      werdykt: werdykt,
    }),
    detail: { source: ZNACZNIK, dzien: dzis, werdykt },
  });
}
