import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // On the server, this request's CSP nonce (src/lib/security/csp.server.ts);
    // in the browser the router reads it from the page's csp-nonce meta tag.
    ssr: { nonce: globalThis.__prmCspNonce?.() },
  });

  return router;
};
