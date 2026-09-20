-- Uzupełnia domenę w sygnałach zebranych PRZED dodaniem kolumny `host`.
--
-- Bez tego ekran „Śledzenie” pokazywałby „brak sygnału” dla domen, z których
-- dane realnie spływały od tygodni — czyli dokładnie ten fałszywy obraz, który
-- ta zmiana ma usunąć. Dane wyliczane są z adresu, który już jest w wierszu,
-- więc niczego nie zgadujemy i nic nie ginie.
--
-- Wyłącznie UPDATE na nowej kolumnie: żadnej innej wartości to nie dotyka.

-- 1) host = fragment adresu między "://" a pierwszym "/" (albo do końca).
UPDATE tracking_pings
SET host = lower(
  CASE
    WHEN instr(substr(url, instr(url, '://') + 3), '/') > 0
      THEN substr(
             substr(url, instr(url, '://') + 3),
             1,
             instr(substr(url, instr(url, '://') + 3), '/') - 1
           )
    ELSE substr(url, instr(url, '://') + 3)
  END
)
WHERE host = '' AND instr(url, '://') > 0;
--> statement-breakpoint

-- 2) Adresy bez ścieżki, za to z parametrami: "host?a=1" → "host".
UPDATE tracking_pings
SET host = substr(host, 1, instr(host, '?') - 1)
WHERE instr(host, '?') > 0;
--> statement-breakpoint

-- 3) Port nie jest częścią domeny dla tego ekranu: "host:8080" → "host".
UPDATE tracking_pings
SET host = substr(host, 1, instr(host, ':') - 1)
WHERE instr(host, ':') > 0;
--> statement-breakpoint

-- 4) "www." ucinane tak samo jak przy zapisie nowych sygnałów — dla człowieka
--    www.klinika-abc.pl i klinika-abc.pl to jedna strona.
UPDATE tracking_pings
SET host = substr(host, 5)
WHERE host LIKE 'www.%';
