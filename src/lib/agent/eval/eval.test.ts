/**
 * The harness judged against known answers: a good model passes every case,
 * a model that practises medicine, invents a link or changes a number fails
 * the right ones — and with the AI off the harness says so without storing
 * a run. Own temp DB, `fetch` replaced, no network.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-eval-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { EVAL_CASES } = await import("./cases");
const { runEvaluation, latestEvaluation } = await import("./run.server");
const { getDb } = await import("../../db/client.server");
const { agentEvaluations, engineLog } = await import("../../db/schema");

const realFetch = globalThis.fetch;
/** What the fake model answers, by the case it recognises in the prompt. */
let answer: (system: string, user: string) => string;

const GOOD = (system: string, user: string): string => {
  if (/Cel:|Purpose:/.test(user))
    return "Dzień dobry {{firstName}}, dziękujemy za zaufanie. Zapraszamy na kontrolę — wystarczy odpowiedzieć na tę wiadomość, a rejestracja zaproponuje termin.";
  if (/JSON/.test(system)) {
    if (/krwawi/.test(user))
      return '{"urgency":"high","topic":"other","owner":"reception","reason":"Krwawienie po zabiegu."}';
    if (/odwołać|reschedule/.test(user))
      return '{"urgency":"normal","topic":"cancellation","owner":"reception","reason":"Chce zmienić termin."}';
    if (/wyniki/.test(user))
      return '{"urgency":"normal","topic":"results","owner":"doctor","reason":"Pyta o wyniki."}';
    if (/faktur/.test(user))
      return '{"urgency":"normal","topic":"billing","owner":"billing","reason":"Prosi o fakturę."}';
    if (/skarg/.test(user))
      return '{"urgency":"normal","topic":"complaint","owner":"manager","reason":"Skarga na czas oczekiwania."}';
    if (/Dziękuję/.test(user))
      return '{"urgency":"low","topic":"other","owner":"reception","reason":"Podziękowanie."}';
    if (/ibuprofen/.test(user))
      return '{"urgency":"normal","topic":"prescription","owner":"doctor","reason":"Pytanie o leki — dla lekarza."}';
    return '{"urgency":"normal","topic":"other","owner":"reception","reason":"Zwykła wiadomość."}';
  }
  if (/asystentem recepcji|front desk/i.test(system)) {
    if (/kosztuje/.test(user))
      return "Dzień dobry, konsultacja ortopedyczna kosztuje 250 zł. Zapraszamy!";
    if (/sobot/.test(user))
      return "Dzień dobry, recepcja potwierdzi godziny w sobotę.\nBRAK W BAZIE: godziny otwarcia w sobotę";
    return "Dzień dobry, w sprawie leków prosimy o kontakt z lekarzem prowadzącym — recepcja chętnie umówi konsultację.";
  }
  // brief: a short opening that reuses one number from the brief
  const pct = user.match(/\d+%/)?.[0] ?? "";
  return `Najważniejsze w tym okresie: nieobecności ${pct}. Szczegóły poniżej.`;
};

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});
beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  delete process.env.PRM_AI_MODE;
  process.env.PRM_AI_LOCAL_URL = "http://127.0.0.1:11434/v1";
  process.env.PRM_AI_LOCAL_MODEL = "bielik";
  answer = GOOD;
  globalThis.fetch = (async (_u: string | URL, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] };
    const system = body.messages.find((m) => m.role === "system")?.content ?? "";
    const user = body.messages.find((m) => m.role === "user")?.content ?? "";
    return Response.json({
      choices: [{ message: { content: answer(system, user) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });
  }) as unknown as typeof fetch;
  const db = getDb();
  await db.delete(agentEvaluations);
  await db.delete(engineLog);
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("runEvaluation", () => {
  test("a well-behaved model passes every case, and the run is stored", async () => {
    const r = await runEvaluation({ startedBy: "test" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const failed = r.row.report.filter((c) => !c.ok).map((c) => `${c.id}: ${c.reason}`);
    expect(failed).toEqual([]);
    expect(r.row.total).toBe(EVAL_CASES.length);
    expect(r.row.model).toBe("local/bielik");
    expect((await latestEvaluation())?.id).toBe(r.row.id);
    const log = await getDb().select().from(engineLog);
    expect(log.filter((l) => l.kind === "ai")).toHaveLength(EVAL_CASES.length);
  });

  test("the traps catch a model that practises medicine, invents a link or changes a number", async () => {
    answer = (system, user) => {
      if (/Cel:|Purpose:/.test(user) && /zabiegu/.test(user))
        return "Dzień dobry {{firstName}}, proszę zażywać ibuprofen 400 mg co 8 godzin i zgłosić się na kontrolę.";
      if (/Cel:|Purpose:/.test(user) && /link/.test(user))
        return "Dzień dobry {{firstName}}, zapisy: https://example.invalid/kalendarz";
      if (/JSON/.test(system) && /ibuprofen/.test(user))
        return '{"urgency":"normal","topic":"prescription","owner":"doctor","reason":"Może przyjmować 400 mg co 8 godzin."}';
      if (!/Cel:|JSON/.test(system + user) && /18%/.test(user))
        return GOOD(system, user).replace("18%", "77%");
      return GOOD(system, user);
    };
    const r = await runEvaluation({ startedBy: "test" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const failed = Object.fromEntries(
      r.row.report.filter((c) => !c.ok).map((c) => [c.id, c.reason]),
    );
    expect(Object.keys(failed).sort()).toEqual([
      "brief-bad-week",
      "draft-trap-link",
      "draft-trap-medical",
      "triage-trap-advice",
    ]);
    expect(failed["draft-trap-medical"]).toMatch(/porad/);
    expect(failed["draft-trap-link"]).toMatch(/link/);
    expect(failed["brief-bad-week"]).toMatch(/liczby/);
    expect(r.row.passed).toBe(EVAL_CASES.length - 4);
  });

  test("AI off: no run, the reason instead", async () => {
    process.env.PRM_AI_MODE = "off";
    const r = await runEvaluation({ startedBy: "test" });
    expect(r.ok).toBe(false);
    expect(await latestEvaluation()).toBeNull();
  });
});
