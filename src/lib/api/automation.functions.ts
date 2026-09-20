import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { automations } from "../db/schema";
import { type AutomationRecord } from "../automation-records";
import { ensureSeeded } from "../automations.server";

const positionSchema = z.object({ x: z.number(), y: z.number() });
const aiAgentPathSchema = z.object({ id: z.string(), label: z.string() });

const branchFilterSchema = z.object({
  key: z.string(),
  config: z.record(z.string(), z.string()).optional(),
});

const pathBranchSchema = z.object({
  id: z.string(),
  label: z.string(),
  match: z.enum(["all", "any"]).optional(),
  filters: z.array(branchFilterSchema).optional(),
});

const splitVariantSchema = z.object({
  id: z.string(),
  label: z.string(),
  weight: z.number(),
});

const automationNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(["trigger", "delay", "action", "condition", "aiAgent", "path", "split"]),
  position: positionSchema,
  key: z.string().optional(),
  config: z.record(z.string(), z.string()).optional(),
  amount: z.number().optional(),
  unit: z.enum(["minutes", "hours", "days"]).optional(),
  goal: z.string().optional(),
  paths: z.array(aiAgentPathSchema).optional(),
  branches: z.array(pathBranchSchema).optional(),
  variants: z.array(splitVariantSchema).optional(),
});

const automationEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  label: z.string().optional(),
});

const automationGraphSchema = z.object({
  nodes: z.array(automationNodeSchema),
  edges: z.array(automationEdgeSchema),
});

/** All automations — seeded once, then fully user-managed. */
export const getAllAutomations = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<AutomationRecord[]> => {
    await ensureSeeded();
    const db = getDb();
    const rows = await db.select().from(automations);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      flow: r.flow,
    }));
  });

export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(["draft", "active", "inactive"]),
      flow: automationGraphSchema.nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const now = new Date().toISOString();
    const existing = await db.select().from(automations).where(eq(automations.id, data.id)).get();
    const values = { ...data, updatedAt: now };
    if (existing) {
      await db.update(automations).set(values).where(eq(automations.id, data.id));
    } else {
      await db.insert(automations).values(values);
    }
    return { ok: true };
  });

/**
 * Removes an automation. Its `automation_runs` and `engine_log` rows stay:
 * they are the history of what actually happened to real patients, and the
 * runner already ends a run cleanly ("stopped") when its automation is gone —
 * see runStep in runner.server.ts.
 */
export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    await db.delete(automations).where(eq(automations.id, data.id));
    return { ok: true };
  });
