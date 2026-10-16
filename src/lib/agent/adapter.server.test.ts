/**
 * The tuned model against the database: the gate on enabling it, the
 * scores recorded with the decision, the model in force, the return to the
 * base model. Own temp database; runs of the harness are inserted as rows,
 * so no model and no network.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-adapter-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { adapterGate } = await import("./adapter");
const { adapterComparison, decideDirection, developmentState, listDirections, proposeDirections } =
  await import("./directions.server");
const { activeLocalModel, getAiConfig } = await import("../ai/settings.server");
const { getDb } = await import("../db/client.server");
const { agentDirections, agentEvaluations, engineLog } = await import("../db/schema");

const NOW = Date.parse("2026-10-14T10:00:00Z");
const CASES = ["a", "b", "c", "d"];

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
  process.env.PRM_AI_LOCAL_ADAPTER_MODEL = "bielik-tuned";
  const db = getDb();
  for (const t of [agentDirections, agentEvaluations, engineLog]) await db.delete(t);
});
afterAll(() => {
  delete process.env.PRM_AI_LOCAL_ADAPTER_MODEL;
  fs.rmSync(dir, { recursive: true, force: true });
});

let seq = 0;
async function evaluated(model: string, passed: number, cases = CASES, at = NOW) {
  await getDb()
    .insert(agentEvaluations)
    .values({
      id: `run-${++seq}`,
      runAt: at + seq,
      model: `local/${model}`,
      total: cases.length,
      passed,
      report: cases.map((id, i) => ({
        id,
        feature: "draft",
        title: id,
        ok: i < passed,
        reason: "",
        output: "",
      })),
      startedBy: "test",
    });
}

const score = (passed: number, cases = CASES) => ({
  model: "local/x",
  passed,
  total: cases.length,
  runAt: NOW,
  caseIds: cases,
});

describe("the gate", () => {
  test("opens only for no fewer cases passed on the same set of cases", () => {
    expect(adapterGate(score(3), score(3)).ok).toBe(true);
    expect(adapterGate(score(3), score(4)).ok).toBe(true);
    expect(adapterGate(score(3), score(2))).toMatchObject({ ok: false });
    expect(adapterGate(score(3), score(2)).reason).toContain("2/4");
    expect(adapterGate(null, score(4)).ok).toBe(false);
    expect(adapterGate(score(3), null).ok).toBe(false);
    expect(adapterGate(score(3), score(4, ["a", "b", "c", "e"])).ok).toBe(false);
  });
});

describe("the tuned model direction", () => {
  test("is proposed when a model with the adapter is configured, with both scores as evidence", async () => {
    await evaluated("bielik", 3);
    expect((await developmentState()).adapter).toEqual({
      base: { passed: 3, total: 4 },
      tuned: null,
    });
    await proposeDirections(NOW);
    const row = (await listDirections()).find((d) => d.key === "tuned_model");
    expect(row?.status).toBe("proposed");
    expect(row?.evidence?.base).toBe("3/4");
  });

  test("is not proposed without an adapter model", async () => {
    delete process.env.PRM_AI_LOCAL_ADAPTER_MODEL;
    await proposeDirections(NOW);
    expect((await listDirections()).some((d) => d.key === "tuned_model")).toBe(false);
  });

  test("cannot be enabled when the tuned model scores worse — the base model stays", async () => {
    await evaluated("bielik", 4);
    await evaluated("bielik-tuned", 3);
    const r = await decideDirection({ key: "tuned_model", decision: "enable", decidedBy: "Admin" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("3/4");
    expect((await activeLocalModel()).model).toBe("bielik");
  });

  test("cannot be enabled before both models were run", async () => {
    await evaluated("bielik", 3);
    const r = await decideDirection({ key: "tuned_model", decision: "enable", decidedBy: "Admin" });
    expect(r.ok).toBe(false);
  });

  test("enabled when no worse: both scores are recorded and the tuned model is in force; one click returns", async () => {
    await evaluated("bielik", 3);
    await evaluated("bielik-tuned", 3);
    const r = await decideDirection({ key: "tuned_model", decision: "enable", decidedBy: "Admin" });
    expect(r.ok).toBe(true);
    const row = (await listDirections()).find((d) => d.key === "tuned_model");
    expect(row?.evidence).toEqual({
      baseModel: "local/bielik",
      base: "3/4",
      tunedModel: "local/bielik-tuned",
      tuned: "3/4",
    });
    expect((await getAiConfig()).model).toBe("bielik-tuned");

    await decideDirection({ key: "tuned_model", decision: "decline", decidedBy: "Admin" });
    expect((await getAiConfig()).model).toBe("bielik");
    // The scores of the decision stay readable after the return.
    expect((await listDirections()).find((d) => d.key === "tuned_model")?.evidence?.tuned).toBe(
      "3/4",
    );
  });

  test("falls back to the base model when the adapter is removed from .env", async () => {
    await evaluated("bielik", 3);
    await evaluated("bielik-tuned", 4);
    await decideDirection({ key: "tuned_model", decision: "enable", decidedBy: "Admin" });
    delete process.env.PRM_AI_LOCAL_ADAPTER_MODEL;
    expect((await getAiConfig()).model).toBe("bielik");
    expect((await adapterComparison()).configured).toBe(false);
  });

  test("a newer run showing the tuned model worse sends the agent back to the base model", async () => {
    await evaluated("bielik", 3);
    await evaluated("bielik-tuned", 4);
    await decideDirection({ key: "tuned_model", decision: "enable", decidedBy: "Admin" });
    await evaluated("bielik-tuned", 2);
    await proposeDirections(NOW + 10_000);
    const row = (await listDirections()).find((d) => d.key === "tuned_model");
    expect(row).toMatchObject({ status: "declined", decidedBy: "PRM_Agent" });
    expect(row?.note).toContain("2/4");
    expect((await activeLocalModel()).tuned).toBe(false);
  });
});
