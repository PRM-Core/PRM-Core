import process from "node:process";
import { getAiConfig } from "../src/lib/ai/settings.server";
import { priceCall } from "../src/lib/ai/provider.server";

/**
 * Sprawdzenie klucza dostawcy AI — po rotacji, przed wygaśnięciem starego.
 *
 *   bun scripts/sprawdz-klucz-ai.ts
 *
 * Wykonuje **jedno najmniejsze możliwe zapytanie** do modelu i mówi, czy klucz
 * działa. Koszt jest w okolicach setnych części centa.
 *
 * **Klucza nie wypisuje ani w całości, ani we fragmencie.** Pokazuje wyłącznie,
 * czy jest ustawiony i czy dostawca go przyjął — bo to jedyne, co trzeba
 * wiedzieć, a wypisany klucz zostaje potem w historii terminala i w logach.
 *
 * Po co osobno, skoro jest ekran Ustawienia → AI: tamten pokazuje jedynie, czy
 * zmienna **istnieje**. Klucz wygasły, cofnięty albo z literówką wygląda tam
 * dokładnie tak samo jak działający — różnicę widać dopiero przy pierwszym
 * prawdziwym zapytaniu, czyli zwykle wtedy, gdy ktoś próbuje z niego skorzystać.
 */

const config = await getAiConfig();
const nazwaZmiennej =
  config.providerId === "anthropic"
    ? "ANTHROPIC_API_KEY"
    : config.providerId === "openai"
      ? "OPENAI_API_KEY"
      : "GEMINI_API_KEY";

const ustawiony = !!process.env[nazwaZmiennej];
console.log(`Dostawca:  ${config.providerId} (${config.model})`);
console.log(`Zmienna:   ${nazwaZmiennej} — ${ustawiony ? "ustawiona" : "BRAK"}`);

if (!ustawiony) {
  console.log(`\n✖ Nie ma czego sprawdzać. Uzupełnij ${nazwaZmiennej} w pliku .env.`);
  process.exit(1);
}

const start = Date.now();
try {
  const odp = await config.provider.complete({
    model: config.model,
    system: "Odpowiedz jednym słowem.",
    messages: [{ role: "user", text: "Napisz: dziala" }],
    tools: [],
    maxTokens: 5,
  });
  const koszt = priceCall(config.providerId, config.model, odp.usage);
  console.log(`\n✔ Klucz działa. Odpowiedź w ${Date.now() - start} ms.`);
  console.log(
    `  tokeny: ${odp.usage.inputTokens} wejściowych / ${odp.usage.outputTokens} wyjściowych · koszt $${koszt.toFixed(5)}`,
  );
} catch (err) {
  const tresc = err instanceof Error ? err.message : String(err);
  console.log(`\n✖ Dostawca odrzucił zapytanie.`);
  console.log(`  ${tresc.slice(0, 300)}`);
  console.log(
    `\n  „authentication_error" znaczy klucz zły, wygasły albo cofnięty.` +
      `\n  Po podmianie w .env kontener trzeba uruchomić ponownie — zmienne czyta przy starcie.`,
  );
  process.exit(1);
}
