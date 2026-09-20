#!/usr/bin/env bash
#
# Sprawdzenie zabezpieczeń po wdrożeniu.
#
#   ./scripts/sprawdz-bezpieczenstwo.sh https://crm.przyklad.pl
#
# Same odczyty — skrypt niczego nie zmienia i nie wysyła. Sprawdza, czy
# funkcje serwerowe i trasy MCP odmawiają danych bez logowania, żeby taka
# pomyłka nie weszła niezauważona w kolejnym wydaniu.

set -uo pipefail

BASE="${1:-https://crm.przyklad.pl}"
BASE="${BASE%/}"

# Identyfikator funkcji `getAllContacts`. Wynika z nazwy pliku i nazwy eksportu,
# więc jest ten sam w każdej budowie — dopóki funkcja nazywa się tak samo.
KARTOTEKI="02709757d15c4dae99170c06ff2c342420e3d822eea38442817cb450565b81c0"

BLEDY=0
zielone() { printf "  \033[32m✔\033[0m %s\n" "$1"; }
czerwone() { printf "  \033[31m✖ %s\033[0m\n" "$1"; BLEDY=$((BLEDY + 1)); }

echo "▸ Sprawdzam $BASE"
echo

# ── 1. Funkcje serwerowe ────────────────────────────────────────────────────
# Najważniejszy test. Bez sesji ma wrócić przekierowanie na /login, a nie dane.
ODP=$(curl -s --max-time 30 -H 'x-tsr-serverFn: true' "$BASE/_serverFn/$KARTOTEKI" | head -c 4000)
if [[ "$ODP" == *"isSerializedRedirect"* ]]; then
	zielone "funkcje serwerowe: bez sesji odsyłają na logowanie"
elif [[ "$ODP" == *"pesel"* || "$ODP" == *"prmId"* ]]; then
	czerwone "FUNKCJE SERWEROWE ODDAJĄ KARTOTEKI BEZ LOGOWANIA — to wyciek danych pacjentów"
elif [[ -z "$ODP" ]]; then
	czerwone "funkcje serwerowe: pusta odpowiedź (nieznany identyfikator? sprawdź nazwę eksportu)"
else
	czerwone "funkcje serwerowe: nieoczekiwana odpowiedź — obejrzyj ją ręcznie"
fi

# ── 2. Trasy MCP ────────────────────────────────────────────────────────────
for SCIEZKA in "/mcp" "/.mcp/list-tools" "/.mcp/invoke-tool/list_contacts"; do
	KOD=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 -X POST "$BASE$SCIEZKA" \
		-H 'Content-Type: application/json' -d '{"limit":1}')
	if [[ "$KOD" == "404" ]]; then
		zielone "$SCIEZKA — zamknięte (404)"
	else
		czerwone "$SCIEZKA — odpowiada $KOD, powinno 404"
	fi
done

# ── 3. /health ──────────────────────────────────────────────────────────────
ZDROWIE=$(curl -s --max-time 20 "$BASE/health")
if [[ "$ZDROWIE" == '{"status":"ok"}' ]]; then
	zielone "/health: sam status, bez wersji i liczby kontaktów"
elif [[ "$ZDROWIE" == *"contacts"* || "$ZDROWIE" == *"version"* ]]; then
	czerwone "/health wystawia szczegóły anonimowo: $ZDROWIE"
else
	czerwone "/health odpowiada nietypowo: $ZDROWIE"
fi

# ── 4. Nagłówki ─────────────────────────────────────────────────────────────
NAGLOWKI=$(curl -s -I --max-time 20 "$BASE/login")
for N in "strict-transport-security" "x-content-type-options" "x-frame-options" "permissions-policy"; do
	if grep -qi "^$N" <<<"$NAGLOWKI"; then
		zielone "nagłówek $N obecny"
	else
		czerwone "brak nagłówka $N (przeładowano Caddy?)"
	fi
done
if grep -qi "^server:" <<<"$NAGLOWKI"; then
	czerwone "nagłówek Server nadal się przedstawia"
else
	zielone "nagłówek Server usunięty"
fi

# ── 5. Przekierowanie na HTTPS ──────────────────────────────────────────────
KOD=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "http://${BASE#https://}/")
if [[ "$KOD" == "308" || "$KOD" == "301" || "$KOD" == "302" ]]; then
	zielone "HTTP przekierowuje na HTTPS ($KOD)"
else
	czerwone "HTTP odpowiada $KOD zamiast przekierować"
fi

echo
if [[ "$BLEDY" -eq 0 ]]; then
	echo "▸ Wszystko w porządku."
else
	echo "▸ Do poprawy: $BLEDY" >&2
	exit 1
fi
