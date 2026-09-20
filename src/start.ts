import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Przekierowania i celowe odpowiedzi HTTP nie są awarią. TanStack Router
    // realizuje `redirect()` **rzucając obiektem `Response`** — złapanie go tutaj
    // zamieniałoby przekierowanie na ekran „ta strona się nie wczytała".
    // Ma to znaczenie, bo bramka `authedServerFn` odsyła w ten sposób
    // na ekran logowania każdą funkcję serwerową wywołaną bez sesji.
    if (error instanceof Response) {
      throw error;
    }
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
