/**
 * Konfiguracja Vite dla pracy LOKALNEJ (`bun run dev`) — z wtyczkami Lovable.
 *
 * **Kopia zapasowa `vite.config.ts`, nie druga konfiguracja.** Budowanie paczki
 * produkcyjnej podmienia `vite.config.ts` na `vite.config.oss.ts` (tak samo robi
 * Dockerfile), a po budowie trzeba przywrócić wariant lokalny. Trzymanie tej
 * kopii w `/tmp` zawiodło dwa razy — system czyści ten katalog i po sprzątaniu
 * projekt startował bez wtyczek, co wygląda na awarię, a jest brakiem pliku.
 *
 *   cp vite.config.oss.ts vite.config.ts && bun run build   # paczka
 *   cp vite.config.lovable.ts vite.config.ts                # powrót do pracy
 */
// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // **Bez wtyczki MCP.** Generuje trasy `/mcp`, `/.mcp/list-tools`
  // i `/.mcp/invoke-tool/:tool` bez żadnego logowania. Trasy są przejęte
  // na własność i zamknięte (`src/lib/mcp/guard.server.ts`), a wtyczka musiała
  // stąd zniknąć z dwóch powodów: odtwarzałaby te pliki przy każdym budowaniu,
  // kasując zamek, a widząc pliki przejęte — **przerywa budowanie**.
});
