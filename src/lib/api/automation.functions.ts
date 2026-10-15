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
  kind: z.enum(["trigger", "delay", "action", "condition", "aiAgent", "path", "split", "wait"]),
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
    const { getCallsToday } = await import("../ai/settings.server");
    const today = new Map<string, number>();
    for (const r of rows)
      if (r.flow?.nodes.some((n) => n.kind === "aiAgent"))
        today.set(r.id, await getCallsToday(r.id));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      flow: r.flow,
      reviewFirst: r.reviewFirst,
      reviewed: r.reviewed,
      aiCallsPerDay: r.aiCallsPerDay,
      aiCallsToday: today.get(r.id) ?? 0,
      quietHours: r.quietHours,
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
      reviewFirst: z.number().int().min(0).max(50).optional(),
      aiCallsPerDay: z.number().int().min(0).max(100_000).optional(),
      quietHours: z.enum(["respect", "ignore"]).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const now = new Date().toISOString();
    const existing = await db.select().from(automations).where(eq(automations.id, data.id)).get();
    // `reviewed` is never taken from the client: only an approval counts.
    const { reviewFirst, aiCallsPerDay, quietHours, ...rest } = data;
    const values = {
      ...rest,
      updatedAt: now,
      ...(aiCallsPerDay === undefined ? {} : { aiCallsPerDay }),
      ...(quietHours === undefined ? {} : { quietHours }),
    };
    if (existing) {
      await db
        .update(automations)
        .set(reviewFirst === undefined ? values : { ...values, reviewFirst })
        .where(eq(automations.id, data.id));
    } else {
      // A new automation starts on trial: its first messages wait for a person.
      const { DEFAULT_REVIEW_FIRST } = await import("../agent/automation-review.server");
      await db
        .insert(automations)
        .values({ ...values, reviewFirst: reviewFirst ?? DEFAULT_REVIEW_FIRST, reviewed: 0 });
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
