/**
 * English interface texts, keyed by the Polish original.
 *
 * Split by area only to keep the files reviewable; the keys share one space.
 * A key that appears in two files is reported by `bun run i18n:check`.
 */
import { shell } from "./shell";
import { contacts } from "./contacts";
import { automation } from "./automation";
import { content } from "./content";
import { sends } from "./sends";
import { segments } from "./segments";
import { reports } from "./reports";
import { integrations } from "./integrations";
import { settings } from "./settings";
import { studio } from "./studio";
import { catalog } from "./catalog";
import { engine } from "./engine";
import { library } from "./library";
import { server } from "./server";
import { server2 } from "./server2";
import { ui2 } from "./ui2";
import { server3 } from "./server3";
import { server4 } from "./server4";
import { server5 } from "./server5";
import { server6 } from "./server6";
import { booking } from "./booking";
import { docplanner } from "./docplanner";
import { accounts } from "./accounts";

export const EN_PARTS: Record<string, Record<string, string>> = {
  shell,
  contacts,
  automation,
  content,
  sends,
  segments,
  reports,
  integrations,
  settings,
  studio,
  catalog,
  engine,
  library,
  server,
  server2,
  ui2,
  server3,
  server4,
  server5,
  server6,
  booking,
  docplanner,
  accounts,
};

/**
 * English texts of an installation's booking system provider —
 * `src/lib/booking-system/providers/*.en.ts` exporting `en`. Loaded by Vite at
 * build time (none outside Vite; `i18n:check` loads them itself), so a
 * provider brings its own texts without editing this file.
 */
type ProviderTexts = { en?: Record<string, string> };
const providerParts: Record<string, Record<string, string>> = (() => {
  let modules: Record<string, ProviderTexts>;
  try {
    // Rewritten by Vite at build time; absent at runtime outside Vite.
    modules = import.meta.glob<ProviderTexts>("../../booking-system/providers/*.en.ts", {
      eager: true,
    });
  } catch {
    return {};
  }
  return Object.fromEntries(
    Object.entries(modules)
      .filter(([, m]) => m.en)
      .map(([path, m]) => [`provider:${path.split("/").pop()}`, m.en!]),
  );
})();
Object.assign(EN_PARTS, providerParts);

export const EN: Record<string, string> = Object.assign({}, ...Object.values(EN_PARTS));

/** Add a provider's English texts from code — for `i18n:check`, which runs outside Vite. */
export function registerEnglish(part: string, entries: Record<string, string>): void {
  EN_PARTS[part] = entries;
  Object.assign(EN, entries);
}
