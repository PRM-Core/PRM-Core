// PRZEJĘTE NA WŁASNOŚĆ (baner wtyczki zdjęty celowo — inaczej
// @lovable.dev/mcp-js odtwarza ten plik przy każdym budowaniu i kasuje zamek).
//
// Trasa była publiczna i oddawała kartoteki pacjentów z numerem PESEL bez
// żadnego uwierzytelnienia. `mcpDenied` zamyka ją: bez `PRM_MCP_TOKEN`
// w środowisku odpowiada 404. Szczegóły w src/lib/mcp/guard.server.ts.
// route: /.mcp/invoke-tool/$tool
// emitted to: src/routes/[.mcp]/invoke-tool/$tool.ts

import { createFileRoute } from "@tanstack/react-router";
import { mcpDenied } from "../../../lib/mcp/guard.server";

import { createTanStackInvokeToolHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../../../lib/mcp/index";

const mcpHandler = createTanStackInvokeToolHandler(mcp, {
  resourcePath: "/mcp",
  metadataPath: "/.well-known/oauth-protected-resource",
  trustForwardedHost: true,
});

export const Route = createFileRoute("/.mcp/invoke-tool/$tool")({
  server: {
    handlers: {
      // ANY: TanStack returns SPA HTML for methods not in `handlers`; the SDK 405s instead.
      ANY: async (ctx: { request: Request; params: { tool: string } }) =>
        (await mcpDenied(ctx.request)) ?? mcpHandler(ctx),
    },
  },
});
