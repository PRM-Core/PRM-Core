import { createServerFn } from "@tanstack/react-start";
import { allowReporter } from "./require-user";

/**
 * Demo mode for the interface: whether the banner shows, and what the demo
 * outbox holds — the messages the system would have sent. Read-only, so the
 * preview role (the usual account for demo visitors) may see both.
 */

export interface DemoStatus {
  demo: boolean;
  /** Seconds between simulator steps. */
  tickSeconds: number;
  /** Warsaw hour of the nightly reset. */
  resetHour: number;
}

export const getDemoStatus = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<DemoStatus> => {
    const { isDemoMode, demoTickMs, demoResetHour } = await import("../demo/mode.server");
    return {
      demo: isDemoMode(),
      tickSeconds: demoTickMs() / 1000,
      resetHour: demoResetHour(),
    };
  });

export interface DemoOutboxView {
  id: string;
  channel: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  createdAt: number;
}

export const getDemoOutbox = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<{ demo: boolean; items: DemoOutboxView[] }> => {
    const { isDemoMode } = await import("../demo/mode.server");
    // Outside demo mode the table does not exist and nothing is ever recorded.
    if (!isDemoMode()) return { demo: false, items: [] };
    const { listDemoOutbox, previewSafeHtml } = await import("../demo/outbox.server");
    const rows = await listDemoOutbox(100);
    return {
      demo: true,
      items: rows.map((r) => (r.channel === "email" ? { ...r, body: previewSafeHtml(r.body) } : r)),
    };
  });
