/**
 * Silnik własnych raportów na prawdziwej bazie (tymczasowy SQLite + migracje).
 *
 * Dane są dobrane pod pułapki, które dają wiarygodnie wyglądające, błędne
 * liczby: wizyta o 00:30 czasu polskiego (w UTC to jeszcze dzień wcześniej),
 * wizyta o 23:59 ostatniego dnia zakresu i minutę po północy, kontakt
 * z uszkodzonym JSON-em tagów, wizyta bez ceny, dwa otwarcia tej samej
 * wiadomości.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";

const katalog = fs.mkdtempSync(path.join(os.tmpdir(), "prm-raporty-"));
const plik = path.join(katalog, "test.db");
const adresBazy = `file:${plik}`;

const { runWidget, listFilterValues, compileWidget, ReportQueryError } =
  await import("./query.server");
import type { ReportRange, ReportWidget } from "./catalog";

const RANGE: ReportRange = { preset: "custom", from: "2026-09-01", to: "2026-09-14" };
const T = (iso: string) => Date.parse(iso);

function widget(p: Partial<ReportWidget>): ReportWidget {
  return {
    id: "w",
    type: "table",
    title: "",
    width: "full",
    source: "contacts",
    measures: ["count"],
    dimensions: [],
    filters: [],
    limit: 50,
    ...p,
  };
}

beforeAll(async () => {
  // Adres bazy ustawiany dopiero tu — patrz komentarz w segments.test.ts.
  process.env.DATABASE_URL = adresBazy;
  const wynik = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (wynik.status !== 0)
    throw new Error(`Migracje nie przeszły:\n${wynik.stdout}\n${wynik.stderr}`);

  const db = createClient({ url: `file:${plik}` });
  const contact = (
    id: string,
    day: string,
    status: string,
    source: string,
    tags: string,
    consent: number,
  ) =>
    db.execute({
      sql: `insert into contacts (id, prm_id, first_name, last_name, email, phone, source, medium, campaign,
            created_at, status, segments, tags, custom_fields, consent_email) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id,
        `PRM-${id}`,
        "A",
        "B",
        `${id}@x.pl`,
        "",
        source,
        "",
        "",
        day,
        status,
        "[]",
        tags,
        "{}",
        consent,
      ],
    });
  await contact("c1", "2026-09-01", "patient", "facebook", '["vip","kardio"]', 1);
  await contact("c2", "2026-09-01", "", "google", "[]", 0);
  await contact("c3", "2026-09-02", "patient", "facebook", '["kardio"]', 1);
  await contact("c4", "2026-09-10", "active", "", "to nie jest json", 0);
  await contact("c5", "2026-08-20", "patient", "facebook", "[]", 1); // przed zakresem

  const visit = (id: string, contactId: string, iso: string, price: number | null, spec: string) =>
    db.execute({
      sql: `insert into contact_visits (id, contact_id, title, doctor, specialization, starts_at, price_grosze, created_at)
            values (?,?,?,?,?,?,?,?)`,
      args: [id, contactId, "Konsultacja", "Nowak", spec, T(iso), price, 1],
    });
  await visit("v1", "c1", "2026-09-01T22:30:00Z", 20000, "Kardiolog"); // 02.09 00:30 w Warszawie
  await visit("v2", "c1", "2026-09-02T10:00:00Z", null, "Kardiolog");
  await visit("v3", "c3", "2026-09-05T10:00:00Z", 30000, "Ortopeda");
  await visit("v4", "c2", "2026-08-31T21:59:59Z", 10000, "Ortopeda"); // 31.08 23:59:59 — poza zakresem
  await visit("v5", "c2", "2026-09-14T21:59:00Z", null, "Ortopeda"); // 14.09 23:59 — w zakresie
  await visit("v6", "c2", "2026-09-14T22:00:00Z", 99900, "Ortopeda"); // 15.09 00:00 — poza zakresem

  await db.execute({
    sql: "insert into content_items (id, kind, name, blocks, updated_at, created_at) values (?,?,?,?,?,?)",
    args: ["ci1", "email", "Przypomnienie", "[]", "2026-09-01", 1],
  });
  await db.execute({
    sql: `insert into campaigns (id, kind, template_name, segment_id, segment_name, status, sent_count, failed_count,
          audience_count, created_at) values (?,?,?,?,?,?,?,?,?,?)`,
    args: [
      "cp1",
      "email",
      "Newsletter",
      "sg1",
      "VIP",
      "sent",
      120,
      3,
      125,
      T("2026-09-03T08:00:00Z"),
    ],
  });
  await db.execute({
    sql: `insert into campaigns (id, kind, template_name, segment_id, segment_name, status, created_at)
          values (?,?,?,?,?,?,?)`,
    args: [
      "cp2",
      "sms",
      "Przypomnienie SMS",
      "sg2",
      "Wszyscy",
      "scheduled",
      T("2026-09-10T08:00:00Z"),
    ],
  });

  const send = (token: string, iso: string, ci: string | null, cp: string | null) =>
    db.execute({
      sql: "insert into email_sends (token, to_email, subject, content_item_id, campaign_id, sent_at) values (?,?,?,?,?,?)",
      args: [token, "x@x.pl", "Temat", ci, cp, T(iso)],
    });
  await send("s1", "2026-09-03T09:00:00Z", "ci1", null);
  await send("s2", "2026-09-03T09:00:00Z", "ci1", null);
  await send("s3", "2026-09-04T09:00:00Z", null, "cp1");
  await send("s4", "2026-09-04T09:00:00Z", null, null);
  let e = 0;
  const event = (token: string, kind: string) =>
    db.execute({
      sql: "insert into email_events (id, token, kind, occurred_at) values (?,?,?,?)",
      args: [`e${e++}`, token, kind, T("2026-09-05T00:00:00Z")],
    });
  await event("s1", "open");
  await event("s1", "click");
  await event("s2", "delivered");
  await event("s3", "open");
  await event("s3", "open"); // drugie otwarcie tej samej wiadomości
  await event("s3", "bounce");
});

beforeEach(() => {
  process.env.DATABASE_URL = adresBazy;
});

afterAll(() => fs.rmSync(katalog, { recursive: true, force: true }));

const byLabel = (rows: Record<string, unknown>[], key = "m0") =>
  Object.fromEntries(rows.map((r) => [String(r.d0_label), r[key]]));

describe("kontakty", () => {
  test("liczba w podziale na status, z etykietami placówki, bez kontaktu spoza zakresu", async () => {
    const r = await runWidget({ widget: widget({ dimensions: ["status"] }), range: RANGE });
    expect(byLabel(r.rows)).toEqual({ Pacjent: 2, Lead: 1, Aktywny: 1 });
  });

  test("podział po tagu: kontakt bez tagów i z uszkodzonym JSON-em to „(brak)”, nie błąd", async () => {
    const r = await runWidget({ widget: widget({ dimensions: ["tag"] }), range: RANGE });
    expect(byLabel(r.rows)).toEqual({ kardio: 2, vip: 1, "(brak)": 2 });
  });

  test("filtr po tagu nie mnoży kontaktów", async () => {
    const tylko = await runWidget({
      widget: widget({
        type: "kpi",
        filters: [{ dimension: "tag", operator: "in", values: ["kardio", "vip"] }],
      }),
      range: RANGE,
    });
    // c1 ma oba tagi — to wciąż jeden kontakt.
    expect(tylko.rows[0].m0).toBe(2);
    const bez = await runWidget({
      widget: widget({
        type: "kpi",
        filters: [{ dimension: "tag", operator: "in", values: [""] }],
      }),
      range: RANGE,
    });
    expect(bez.rows[0].m0).toBe(2);
    const wykluczone = await runWidget({
      widget: widget({
        type: "kpi",
        filters: [{ dimension: "tag", operator: "not_in", values: ["kardio"] }],
      }),
      range: RANGE,
    });
    expect(wykluczone.rows[0].m0).toBe(2);
  });

  test("zgoda na e-mail jako Tak / Nie", async () => {
    const r = await runWidget({ widget: widget({ dimensions: ["consent_email"] }), range: RANGE });
    expect(byLabel(r.rows)).toEqual({ Tak: 2, Nie: 2 });
  });
});

describe("wizyty — granice doby warszawskiej", () => {
  test("00:30 czasu polskiego trafia do właściwego dnia, 23:59 ostatniego dnia jest w zakresie", async () => {
    const r = await runWidget({
      widget: widget({ type: "line", dimensions: ["day"], source: "visits", measures: ["count"] }),
      range: RANGE,
    });
    expect(r.rows).toHaveLength(14);
    const perDay = Object.fromEntries(r.rows.map((x) => [x.d0, x.m0]));
    expect(perDay["2026-09-01"]).toBe(0);
    expect(perDay["2026-09-02"]).toBe(2);
    expect(perDay["2026-09-05"]).toBe(1);
    expect(perDay["2026-09-14"]).toBe(1);
    expect(r.rows.reduce((n, x) => n + Number(x.m0), 0)).toBe(4);
  });

  test("przychód pomija wizyty bez ceny, średnia też — a pusty dzień średniej to brak, nie zero", async () => {
    const kpi = await runWidget({
      widget: widget({
        type: "table",
        source: "visits",
        measures: ["revenue", "avg_price", "patients"],
        dimensions: ["specialization"],
      }),
      range: RANGE,
    });
    const kardio = kpi.rows.find((x) => x.d0 === "Kardiolog")!;
    expect(kardio.m0).toBe(200);
    expect(kardio.m1).toBe(200);
    expect(kardio.m2).toBe(1);
    const orto = kpi.rows.find((x) => x.d0 === "Ortopeda")!;
    expect(orto.m0).toBe(300);
    expect(orto.m1).toBe(300);
    expect(orto.m2).toBe(2);

    const dni = await runWidget({
      widget: widget({
        type: "line",
        source: "visits",
        measures: ["avg_price"],
        dimensions: ["day"],
      }),
      range: RANGE,
    });
    expect(dni.rows.find((x) => x.d0 === "2026-09-03")!.m0).toBeNull();
  });

  test("tydzień zaczyna się w poniedziałek", async () => {
    const r = await runWidget({
      widget: widget({ type: "line", source: "visits", measures: ["count"], dimensions: ["week"] }),
      range: RANGE,
    });
    expect(r.rows.map((x) => x.d0)).toEqual(["2026-08-31", "2026-09-07", "2026-09-14"]);
    expect(r.rows.map((x) => x.m0)).toEqual([3, 0, 1]);
  });
});

describe("e-maile", () => {
  test("otwarcia liczone raz na wiadomość, wskaźnik z wysłanych", async () => {
    const r = await runWidget({
      widget: widget({
        source: "emails",
        measures: ["sent", "opened", "clicked", "open_rate"],
        dimensions: ["origin"],
      }),
      range: RANGE,
    });
    const inne = r.rows.find((x) => x.d0 === "other")!;
    const kampania = r.rows.find((x) => x.d0 === "campaign")!;
    expect(inne.d0_label).toBe("Automatyzacja lub pojedyncza");
    expect([inne.m0, inne.m1, inne.m2]).toEqual([3, 1, 1]);
    expect(inne.m3).toBeCloseTo(1 / 3, 5);
    expect([kampania.m0, kampania.m1, kampania.m3]).toEqual([1, 1, 1]);
  });

  test("odbite i doręczone", async () => {
    const r = await runWidget({
      widget: widget({
        type: "table",
        source: "emails",
        measures: ["delivered", "bounced"],
        dimensions: ["template"],
      }),
      range: RANGE,
    });
    expect(byLabel(r.rows)).toEqual({ Przypomnienie: 1, "(brak)": 0 });
    expect(byLabel(r.rows, "m1")).toEqual({ Przypomnienie: 0, "(brak)": 1 });
  });
});

describe("kampanie", () => {
  test("status kampanii ma własne etykiety, nie etykiety statusu kontaktu", async () => {
    const r = await runWidget({
      widget: widget({ source: "campaigns", measures: ["count", "sent"], dimensions: ["status"] }),
      range: RANGE,
    });
    expect(byLabel(r.rows)).toEqual({ Wysłana: 1, Zaplanowana: 1 });
    expect(byLabel(r.rows, "m1")).toEqual({ Wysłana: 120, Zaplanowana: 0 });
  });
});

describe("bezpieczeństwo definicji", () => {
  test("wartość filtra z SQL-em jest zwykłym tekstem", async () => {
    const zlosliwe = "x') or 1=1 --";
    const r = await runWidget({
      widget: widget({
        type: "kpi",
        filters: [{ dimension: "source", operator: "in", values: [zlosliwe] }],
      }),
      range: RANGE,
    });
    expect(r.rows[0].m0).toBe(0);
    const { query } = compileWidget(
      widget({
        type: "kpi",
        filters: [{ dimension: "source", operator: "in", values: [zlosliwe] }],
      }),
      { from: "2026-09-01", to: "2026-09-14" },
    );
    // Wartość jest parametrem, a nie fragmentem tekstu zapytania.
    const rendered = new SQLiteSyncDialect().sqlToQuery(query);
    expect(rendered.sql.includes("1=1")).toBe(false);
    expect(rendered.params).toContain(zlosliwe);
  });

  test("klucz spoza katalogu jest odrzucany przed zapytaniem", async () => {
    await expect(
      runWidget({ widget: widget({ dimensions: ["first_name"] }), range: RANGE }),
    ).rejects.toBeInstanceOf(ReportQueryError);
    await expect(
      runWidget({ widget: widget({ measures: ["sum(pesel)"] }), range: RANGE }),
    ).rejects.toBeInstanceOf(ReportQueryError);
    await expect(
      runWidget({ widget: widget({ source: "users" }), range: RANGE }),
    ).rejects.toBeInstanceOf(ReportQueryError);
  });

  test("zły zakres dat to czytelny błąd", async () => {
    await expect(
      runWidget({
        widget: widget({}),
        range: { preset: "custom", from: "2026-09-14", to: "2026-09-01" },
      }),
    ).rejects.toThrow("późniejsza");
  });
});

describe("wartości do filtra", () => {
  test("najczęstsze wartości z etykietami", async () => {
    const v = await listFilterValues({ source: "contacts", dimension: "status", range: RANGE });
    expect(v[0]).toEqual({ value: "patient", label: "Pacjent", count: 2 });
    expect(v.map((x) => x.value).sort()).toEqual(["active", "lead", "patient"]);
  });

  test("po wymiarze czasu nie da się filtrować", async () => {
    await expect(
      listFilterValues({ source: "contacts", dimension: "day", range: RANGE }),
    ).rejects.toBeInstanceOf(ReportQueryError);
  });
});

describe("współbieżność", () => {
  test("kafelki liczone równolegle na pustej tabeli statusów nie wpadają na siebie", async () => {
    // Odtworzenie błędu z przeglądarki: świeża instalacja, raport z kilkoma
    // kafelkami po statusie, wszystkie zapytania naraz. Każde widziało pustą
    // tabelę i próbowało wstawić te same statusy — wszystkie poza pierwszym
    // kończyły się błędem unikalnego klucza.
    const db = createClient({ url: adresBazy });
    await db.execute("delete from contact_statuses");
    const wyniki = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        runWidget({ widget: widget({ dimensions: ["status"] }), range: RANGE }),
      ),
    );
    const bledy = wyniki.filter((w) => w.status === "rejected");
    expect(bledy.map((b) => String((b as PromiseRejectedResult).reason))).toEqual([]);
    for (const w of wyniki) {
      expect(
        byLabel((w as PromiseFulfilledResult<{ rows: Record<string, unknown>[] }>).value.rows),
      ).toEqual({
        Pacjent: 2,
        Lead: 1,
        Aktywny: 1,
      });
    }
  });
});
