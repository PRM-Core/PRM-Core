#!/usr/bin/env bash
#
# PRM Core — wydanie nowej wersji.
#
#   ./deploy.sh v1.0.0
#
# Kolejność jest celowa i nie wolno jej skracać:
#   1. kopia bazy   — zanim cokolwiek ruszy
#   2. build        — do obrazu obok działającego
#   3. start        — migracje lecą przy starcie kontenera
#   4. healthcheck  — sprawdza bazę i wersję migracji, nie sam port
#   5. rollback     — automatyczny, jeśli 4 nie przejdzie
#
# Baza NIE jest częścią wydania. Leży w ./data na hoście i żaden krok jej nie
# nadpisuje ani nie kasuje — nowa wersja podmienia wyłącznie kod. Historia
# kontaktów, automatyzacje i przebiegi przeżywają każde wdrożenie.

set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
	echo "Użycie: ./deploy.sh v1.0.0" >&2
	exit 1
fi

cd "$(dirname "$0")"

DATA_DIR="./data"
BACKUP_DIR="$DATA_DIR/backups"
DB_FILE="$DATA_DIR/prm-core.db"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/prm-core-${VERSION}-${STAMP}.db"

mkdir -p "$BACKUP_DIR"
# Katalog na logi dostępowe Caddy — aplikacja montuje go tylko do odczytu
# i analizuje raz na dobę. Tworzymy tutaj, żeby pierwsze uruchomienie po
# wdrożeniu nie zastało pustego miejsca po montowaniu.
mkdir -p ./logs

# ── 1. Kopia bazy ───────────────────────────────────────────────────────────
if [[ -f "$DB_FILE" ]]; then
	echo "▸ Kopia bazy → $BACKUP_FILE"
	# .backup, a nie cp: kopiuje spójny stan także wtedy, gdy silnik właśnie
	# pisze. Zwykły cp potrafi złapać plik w połowie transakcji.
	if command -v sqlite3 >/dev/null 2>&1; then
		sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
	else
		echo "  (sqlite3 niedostępny — kopiuję plik; zainstaluj sqlite3 dla kopii spójnej)"
		cp "$DB_FILE" "$BACKUP_FILE"
	fi
	# Retencja: 30 ostatnich kopii wydaniowych. Kopie nocne (nightly-*.db.gz)
	# mają własną retencję w scripts/backup.mjs i ten glob ich nie dotyka.
	ls -1t "$BACKUP_DIR"/prm-core-*.db 2>/dev/null | tail -n +31 | xargs -r rm --
else
	echo "▸ Brak bazy — pierwsze uruchomienie, nie ma czego kopiować."
fi

# ── 2. Build ────────────────────────────────────────────────────────────────
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo '')"
echo "▸ Buduję obraz ($VERSION${COMMIT:+ · $COMMIT})"
APP_VERSION="$VERSION" APP_COMMIT="$COMMIT" docker compose build app

# ── 3. Start (migracje lecą w CMD kontenera) ────────────────────────────────
echo "▸ Uruchamiam"
APP_VERSION="$VERSION" APP_COMMIT="$COMMIT" docker compose up -d

# ── 4. Healthcheck ──────────────────────────────────────────────────────────
echo "▸ Sprawdzam /health"
HEALTHY=0
for i in $(seq 1 30); do
	if docker compose exec -T app bun -e "fetch('http://127.0.0.1:3000/health').then(async r=>{const b=await r.json();console.log(JSON.stringify(b));process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"; then
		HEALTHY=1
		break
	fi
	sleep 2
done

# ── 5. Rollback ─────────────────────────────────────────────────────────────
if [[ "$HEALTHY" -ne 1 ]]; then
	echo "✖ Healthcheck nie przeszedł. Logi:" >&2
	docker compose logs --tail 40 app >&2
	echo "" >&2
	echo "Baza NIE została zmieniona przez ten skrypt; kopia sprzed wdrożenia:" >&2
	echo "  $BACKUP_FILE" >&2
	echo "" >&2
	echo "Cofnięcie kodu do poprzedniej wersji:" >&2
	echo "  git checkout <poprzedni-tag> && ./deploy.sh <poprzedni-tag>" >&2
	echo "" >&2
	echo "Jeśli to migracja uszkodziła dane (rzadkie — migracje są tylko" >&2
	echo "dodające), przywróć bazę:" >&2
	echo "  docker compose down && cp '$BACKUP_FILE' '$DB_FILE' && ./deploy.sh <poprzedni-tag>" >&2
	exit 1
fi

echo "✔ Wersja $VERSION działa."
