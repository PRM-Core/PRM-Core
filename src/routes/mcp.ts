// PRZEJĘTE NA WŁASNOŚĆ (baner wtyczki zdjęty celowo — inaczej
// @lovable.dev/mcp-js odtwarza ten plik przy każdym budowaniu i kasuje zamek).
//
// Trasa była publiczna i oddawała kartoteki pacjentów z numerem PESEL bez
// żadnego uwierzytelnienia. `mcpDenied` zamyka ją: bez `PRM_MCP_TOKEN`
// w środowisku odpowiada 404. Szczegóły w src/lib/mcp/guard.server.ts.
// route: /mcp
// emitted to: src/routes/mcp.ts

import { createFileRoute } from "@tanstack/react-router";
import { mcpDenied } from "../lib/mcp/guard.server";

import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../lib/mcp/index";

const mcpHandler = createTanStackMcpHandler(mcp, {
  resourcePath: "/mcp",
  metadataPath: "/.well-known/oauth-protected-resource",
  trustForwardedHost: true,
});

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: async (ctx: { request: Request }) => (await mcpDenied(ctx.request)) ?? mcpHandler(ctx),
    },
  },
});
