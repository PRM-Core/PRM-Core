/**
 * Rozkładanie treści webhooka rezerwacji.
 *
 * Każdy przypadek poniżej odpowiada czemuś, co wydarzyło się naprawdę albo
 * czemu ten kod ma zapobiegać. Najważniejszy jest ten z tagami: 2026-08-26
 * system rezerwacji wysyłał je pod nazwą „Tagi", webhook odpowiadał `ok: true`,
 * a na karcie pacjenta tagów nie było — bo dopasowanie nazw pól szło literalnie.
 * Cicha strata danych przy odpowiedzi „sukces" jest najgorszym rodzajem błędu,
 * bo nadawca nie ma jak jej zauważyć.
 */
import { describe, expect, test } from "bun:test";
import {
  bool,
  foldKey,
  isTestPayload,
  rozlozZgody,
  pick,
  price,
  syntheticBookingId,
  tagList,
  text,
  whole,
} from "./booking-intake.server";

describe("foldKey — porównywanie nazw pól", () => {
  test("ogonki, wielkość liter i separatory nie mają znaczenia", () => {
    expect(foldKey("Tagi")).toBe(foldKey("tagi"));
    expect(foldKey("Imię")).toBe("imie");
    expect(foldKey("first_name")).toBe("firstname");
    expect(foldKey("First-Name")).toBe("firstname");
    expect(foldKey("  IDX Osoby  ")).toBe("idxosoby");
  });

  test("wszystkie polskie znaki mają odpowiednik", () => {
    expect(foldKey("ąćęłńóśźż")).toBe("acelnoszz");
  });
});

describe("pick — wartość spod dowolnego aliasu", () => {
  test("trafia mimo innej pisowni nazwy pola", () => {
    expect(pick({ Tagi: "a,b" }, "tags", "tagi")).toBe("a,b");
    expect(pick({ IMIE: "Ala" }, "firstName", "imie")).toBe("Ala");
    expect(pick({ "idx-osoby": 7 }, "idx_osoby")).toBe(7);
  });

  test("brak pola to undefined, a nie pusty tekst", () => {
    // Rozróżnienie jest istotne przy zgodach: „nie przysłano" znaczy co innego
    // niż „przysłano nie".
    expect(pick({ a: 1 }, "b")).toBeUndefined();
  });
});

describe("tagList — tagi przychodzą raz tablicą, raz tekstem", () => {
  test("tablica", () => {
    expect(tagList(["nowy", "vip"])).toEqual(["nowy", "vip"]);
  });

  test("tekst rozdzielony przecinkiem, średnikiem lub kreską pionową", () => {
    expect(tagList("nowy, vip")).toEqual(["nowy", "vip"]);
    expect(tagList("nowy;vip")).toEqual(["nowy", "vip"]);
    expect(tagList("nowy|vip")).toEqual(["nowy", "vip"]);
  });

  test("puste wpisy i duplikaty odpadają", () => {
    expect(tagList("nowy,,vip,nowy")).toEqual(["nowy", "vip"]);
    expect(tagList([" a ", "", "a"])).toEqual(["a"]);
  });

  test("brak tagów to pusta lista, nie wyjątek", () => {
    expect(tagList(undefined)).toEqual([]);
    expect(tagList(null)).toEqual([]);
    expect(tagList("   ")).toEqual([]);
    expect(tagList(42)).toEqual([]);
  });
});

describe("bool — zgody z pól formularza", () => {
  test("przyjmuje to, co realnie wysyła formularz", () => {
    for (const v of [true, "1", "true", "on", "tak", "yes", "TAK", " Yes "]) {
      expect(bool(v)).toBe(true);
    }
  });

  test("brak pola i wszystko inne znaczy brak zgody", () => {
    for (const v of [undefined, null, "", "0", "nie", "no", false, "cokolwiek"]) {
      expect(bool(v)).toBe(false);
    }
  });
});

describe("whole — identyfikatory raz liczbą, raz tekstem", () => {
  test("obie postacie dają tę samą liczbę", () => {
    expect(whole(42017)).toBe(42017);
    expect(whole("42017")).toBe(42017);
    expect(whole(" 42017 ")).toBe(42017);
  });

  test("brak wartości i wartości bezsensowne dają null", () => {
    expect(whole(null)).toBeNull();
    expect(whole(undefined)).toBeNull();
    expect(whole("")).toBeNull();
    expect(whole("brak")).toBeNull();
    expect(whole(0)).toBeNull();
  });

  test("kreska: separator działa, minus odrzuca", () => {
    // `IDX-42017` to jedna z postaci, w jakich przychodzi identyfikator —
    // kreska jest tam separatorem. Ale `-5` to liczba ujemna i po usunięciu
    // znaków niebędących cyframi stawała się `5`, czyli identyfikatorem
    // **innego pacjenta**.
    expect(whole("IDX-42017")).toBe(42017);
    expect(whole(-5)).toBeNull();
    expect(whole("-5")).toBeNull();
    expect(whole(" -5 ")).toBeNull();
  });
});

describe("price — kwoty z różnych stron rezerwacji", () => {
  test("format polski i angielski", () => {
    expect(price("250,00 zł")).toBe(250);
    expect(price("250.00")).toBe(250);
    expect(price(250)).toBe(250);
    expect(price("1 200,50 zł")).toBe(1200.5);
  });

  test("brak ceny to null, nie zero", () => {
    // Zero znaczyłoby „wizyta za darmo", a to nieprawda.
    expect(price(null)).toBeNull();
    expect(price("")).toBeNull();
    expect(price("do uzgodnienia")).toBeNull();
  });
});

describe("syntheticBookingId — klucz odsiewania powtórzeń", () => {
  test("te same dane dają ten sam klucz", () => {
    const a = syntheticBookingId(["Ala", "Kowalska", "2026-09-10 12:00"]);
    const b = syntheticBookingId(["ala", " KOWALSKA ", "2026-09-10 12:00"]);
    expect(a).toBe(b);
    expect(a).toStartWith("auto-");
  });

  test("inna wizyta daje inny klucz", () => {
    const a = syntheticBookingId(["Ala", "Kowalska", "2026-09-10 12:00"]);
    const b = syntheticBookingId(["Ala", "Kowalska", "2026-09-10 13:00"]);
    expect(a).not.toBe(b);
  });

  test("bez danych nie zmyślamy klucza", () => {
    // Pusty klucz każe wywołującemu użyć identyfikatora z rezerwacji,
    // zamiast skleić ze sobą dwie różne wizyty pod jednym „auto-0".
    expect(syntheticBookingId([])).toBe("");
    expect(syntheticBookingId([null, "", "  "])).toBe("");
  });
});

describe("isTestPayload — tryb próbny", () => {
  test("rozpoznaje oba pola i oba zapisy", () => {
    expect(isTestPayload({ test: true })).toBe(true);
    expect(isTestPayload({ test: "1" })).toBe(true);
    expect(isTestPayload({ tryb_testowy: "tak" })).toBe(true);
  });

  test("zwykła rezerwacja nie jest testem", () => {
    expect(isTestPayload({})).toBe(false);
    expect(isTestPayload({ test: false })).toBe(false);
    expect(isTestPayload({ imie: "Ala" })).toBe(false);
  });
});

describe("text — normalizacja wartości", () => {
  test("przycina i zamienia brak na pusty tekst", () => {
    expect(text("  Ala  ")).toBe("Ala");
    expect(text(null)).toBe("");
    expect(text(undefined)).toBe("");
    expect(text(7)).toBe("7");
  });
});

describe("rozlozZgody — reguły zgód przy rezerwacji", () => {
  const Z_SYSTEMU = { externalPatientId: 42017, systemVisitId: 9000 };
  const ZE_STRONY = { externalPatientId: null, systemVisitId: null };

  describe("rozpoznanie źródła", () => {
    test("identyfikatory systemu rezerwacji wystarczą", () => {
      expect(rozlozZgody({}, Z_SYSTEMU).zSystemuRezerwacji).toBe(true);
      expect(
        rozlozZgody({}, { externalPatientId: null, systemVisitId: 77 }).zSystemuRezerwacji,
      ).toBe(true);
    });

    test("źródło, którym przedstawia się system dostawcy, też wystarczy", () => {
      const zrodlo = /testsys/i;
      expect(rozlozZgody({ source: "TestSys" }, ZE_STRONY, zrodlo).zSystemuRezerwacji).toBe(true);
      expect(
        rozlozZgody({ utm_source: "TESTSYS online" }, ZE_STRONY, zrodlo).zSystemuRezerwacji,
      ).toBe(true);
      // Bez podłączonego systemu samo źródło niczego nie przesądza.
      expect(rozlozZgody({ source: "TestSys" }, ZE_STRONY).zSystemuRezerwacji).toBe(false);
    });

    test("formularz na stronie to nie system rezerwacji", () => {
      expect(rozlozZgody({ source: "Formularz kontaktowy" }, ZE_STRONY).zSystemuRezerwacji).toBe(
        false,
      );
      expect(rozlozZgody({}, ZE_STRONY).zSystemuRezerwacji).toBe(false);
    });
  });

  describe("system rezerwacji bez pól ze zgodami", () => {
    const z = rozlozZgody({}, Z_SYSTEMU);

    test("cztery obowiązkowe są na tak", () => {
      // Dokładnie to, co pokazywał zrzut z błędem: regulamin musi być „tak".
      expect(z.consentEmail).toBe(true);
      expect(z.consentSms).toBe(true);
      expect(z.consentProfiling).toBe(true);
      expect(z.erejRegulamin).toBe(true);
    });

    test("marketing NIE jest domniemywany", () => {
      // Nieobowiązkowy: brak pola znaczy „nie pytaliśmy", a nie „zgodził się".
      expect(z.erejMarketing).toBeUndefined();
    });

    test("zapis jest oznaczony jako wynikający z trybu rezerwacji", () => {
      expect(z.zgodyDomniemane).toBe(true);
    });
  });

  describe("formularz na stronie bez pól ze zgodami", () => {
    const z = rozlozZgody({}, ZE_STRONY);

    test("nie domniemywamy niczego", () => {
      // Na stronie nie ma zgody obowiązkowej — przyjęcie jej byłoby zmyśleniem
      // oświadczenia, którego pacjent nie złożył.
      expect(z.consentEmail).toBe(false);
      expect(z.consentSms).toBe(false);
      expect(z.consentProfiling).toBe(false);
      expect(z.erejRegulamin).toBeUndefined();
      expect(z.erejMarketing).toBeUndefined();
      expect(z.zgodyDomniemane).toBe(false);
    });
  });

  describe("przysłana wartość zawsze wygrywa z domniemaniem", () => {
    test("odmowa z systemu rezerwacji jest respektowana", () => {
      const z = rozlozZgody(
        { zgoda_email: "nie", zgoda_sms: false, zgoda_profilowanie: "0" },
        Z_SYSTEMU,
      );
      expect(z.consentEmail).toBe(false);
      expect(z.consentSms).toBe(false);
      expect(z.consentProfiling).toBe(false);
      expect(z.zgodyDomniemane).toBe(false);
    });

    test("odmowa regulaminu jest respektowana", () => {
      expect(rozlozZgody({ zgoda_regulamin: "nie" }, Z_SYSTEMU).erejRegulamin).toBe(false);
    });

    test("nazwy pól działają w każdej pisowni", () => {
      const z = rozlozZgody({ "Zgoda Email": "tak", zgodaSms: "1" }, ZE_STRONY);
      expect(z.consentEmail).toBe(true);
      expect(z.consentSms).toBe(true);
    });
  });

  describe("marketing jest niezależny od zgód podstawowych", () => {
    test("odmowa marketingu NIE kasuje e-maila, SMS-a ani profilowania", () => {
      // To jest naprawiany błąd. Do 1.60.0 `zgoda_marketingowa` sterowała całą
      // trójką, więc ten ładunek zerowałby pacjentowi wszystkie zgody.
      const z = rozlozZgody({ zgoda_marketingowa: false }, Z_SYSTEMU);
      expect(z.erejMarketing).toBe(false);
      expect(z.consentEmail).toBe(true);
      expect(z.consentSms).toBe(true);
      expect(z.consentProfiling).toBe(true);
    });

    test("zgoda na marketing nie włącza zgód podstawowych na stronie", () => {
      // Odwrotny kierunek tego samego sprzężenia: na stronie zgoda marketingowa
      // nie jest oświadczeniem o e-mailu ani SMS-ie.
      const z = rozlozZgody({ zgoda_marketingowa: true }, ZE_STRONY);
      expect(z.erejMarketing).toBe(true);
      expect(z.consentEmail).toBe(false);
      expect(z.consentSms).toBe(false);
    });

    test("marketing jest przyjmowany pod każdą z nazw", () => {
      for (const pole of ["zgoda_marketingowa", "zgodaMarketingowa", "marketingConsent"]) {
        expect(rozlozZgody({ [pole]: "tak" }, ZE_STRONY).erejMarketing).toBe(true);
      }
    });
  });

  describe("częściowy komplet pól", () => {
    test("przysłanie choć jednej zgody wyłącza domniemanie dla pozostałych", () => {
      // Rejestracja, która zna te pola, milczeniem o SMS-ie mówi „nie”,
      // a nie „nie wiem”. Domniemanie działa tylko przy pełnym milczeniu.
      const z = rozlozZgody({ zgoda_email: "tak" }, Z_SYSTEMU);
      expect(z.consentEmail).toBe(true);
      expect(z.consentSms).toBe(false);
      expect(z.consentProfiling).toBe(false);
      expect(z.zgodyDomniemane).toBe(false);
    });

    test("regulamin nadal domniemany, bo to osobne oświadczenie", () => {
      expect(rozlozZgody({ zgoda_email: "tak" }, Z_SYSTEMU).erejRegulamin).toBe(true);
    });
  });
});
