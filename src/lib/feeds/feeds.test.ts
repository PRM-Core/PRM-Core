/**
 * Odczyt arkusza — bez bazy i bez sieci: plik powstaje w pamięci.
 *
 * Test pilnuje też wersji biblioteki: `xlsx` idzie z dystrybucji producenta
 * (package.json), bo wydania w npm zostały porzucone z otwartymi podatnościami
 * na czytaniu plików. Podmiana na starszą wersję zmieniłaby zachowanie poniżej.
 */
import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { parseWorkbook } from "./feeds.server";

function skoroszyt(arkusze: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nazwa, wiersze] of Object.entries(arkusze)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wiersze), nazwa);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseWorkbook", () => {
  test("nagłówki z pierwszego wiersza, wartości jako tekst", () => {
    const plik = skoroszyt({
      Lekarze: [
        ["Lekarz", "Rok", "Link"],
        ["Anna Przykładowa", 2021, "https://przyklad.pl/a"],
        ["Jan Przykładowy", "2022", "https://przyklad.pl/b"],
      ],
    });
    const [arkusz] = parseWorkbook(plik, "opinie.xlsx");
    expect(arkusz.columns).toEqual(["Lekarz", "Rok", "Link"]);
    // Liczba i tekst dają ten sam typ — inaczej ta sama kolumna raz byłaby
    // liczbą, raz napisem, a w wiadomości wszystko jest tekstem.
    expect(arkusz.rows.map((r) => r.Rok)).toEqual(["2021", "2022"]);
    expect(arkusz.rows[0].Lekarz).toBe("Anna Przykładowa");
  });

  test("jeden arkusz bierze nazwę z pliku, kilka — własne nazwy", () => {
    const jeden = parseWorkbook(skoroszyt({ Arkusz1: [["A"], ["1"]] }), "cennik.xlsx");
    expect(jeden).toHaveLength(1);
    expect(jeden[0].name).toBe("cennik");

    const dwa = parseWorkbook(
      skoroszyt({ Kardiologia: [["A"], ["1"]], Ortopedia: [["A"], ["2"]] }),
      "cennik.xlsx",
    );
    expect(dwa.map((a) => a.name)).toEqual(["Kardiologia", "Ortopedia"]);
  });

  test("kolumny bez nazwy i puste arkusze odpadają", () => {
    const plik = skoroszyt({
      Dane: [
        ["Imię", "", "Miasto"],
        ["Anna", "śmieć", "Kraków"],
      ],
      Pusty: [],
    });
    const arkusze = parseWorkbook(plik, "dane.xlsx");
    expect(arkusze).toHaveLength(1);
    expect(arkusze[0].columns).toEqual(["Imię", "Miasto"]);
    expect(arkusze[0].rows[0]).toEqual({ Imię: "Anna", Miasto: "Kraków" });
  });

  test("CSV w UTF-8: polskie znaki w nagłówku i w danych", () => {
    const csv = Buffer.from("Imię,Miasto\nAnna,Kraków\nJan,Gdańsk\n", "utf8");
    const [arkusz] = parseWorkbook(csv, "kontakty.csv");
    expect(arkusz.columns).toEqual(["Imię", "Miasto"]);
    expect(arkusz.rows).toEqual([
      { Imię: "Anna", Miasto: "Kraków" },
      { Imię: "Jan", Miasto: "Gdańsk" },
    ]);
  });

  test("CSV z BOM-em i CSV z polskiego Excela (Windows-1250)", () => {
    const bom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("Imię\nŁódź\n", "utf8"),
    ]);
    expect(parseWorkbook(bom, "z-bomem.csv")[0].columns).toEqual(["Imię"]);

    // „Imię\nŁódź" w Windows-1250 — tak zapisuje CSV polski Excel.
    const cp1250 = Buffer.from([0x49, 0x6d, 0x69, 0xea, 0x0a, 0xa3, 0xf3, 0x64, 0x9f, 0x0a]);
    const arkusz = parseWorkbook(cp1250, "z-excela.csv")[0];
    expect(arkusz.columns).toEqual(["Imię"]);
    expect(arkusz.rows[0]["Imię"]).toBe("Łódź");
  });
});
