/**
 * Raport bezpieczeństwa na żądanie.
 *
 *   bun scripts/raport-bezpieczenstwa.ts              # tylko podgląd, nic nie wysyła
 *   bun scripts/raport-bezpieczenstwa.ts --wyslij     # wysyła na adres z ustawień
 *
 * Ten sam raport, który codziennie o 7:00 składa PRM_Agent — tyle że wywołany
 * ręcznie. Po co: żeby zobaczyć pierwszy raport bez czekania do rana i żeby po
 * zmianach w konfiguracji sprawdzić, czy raport w ogóle ma z czego powstać.
 *
 * **Domyślnie sam podgląd** — jak każdy skrypt w tym katalogu, który może coś
 * wysłać lub zmienić.
 */
import { writeFile } from "node:fs/promises";
import process from "node:process";
import {
  buildSecurityReport,
  maybeSendSecurityReport,
} from "../src/lib/security/daily-report.server";

const wyslij = process.argv.includes("--wyslij");

const { subject, html, werdykt } = await buildSecurityReport();

const plik = "/tmp/raport-bezpieczenstwa.html";
await writeFile(plik, html, "utf8");

console.log(`Temat:    ${subject}`);
console.log(`Werdykt:  ${werdykt}`);
console.log(`Podgląd:  ${plik}`);

if (!wyslij) {
  console.log("\nNic nie wysłano. Aby wysłać naprawdę: --wyslij");
  process.exit(0);
}

// Wysyłka idzie tą samą drogą co codzienna, więc podlega tej samej zasadzie
// „raz na dobę": jeśli poranny raport już poszedł, ten nie wyjdzie drugi raz.
await maybeSendSecurityReport();
console.log("\nWysłano (albo dzisiejszy raport już wcześniej wyszedł — sprawdź dziennik silnika).");
