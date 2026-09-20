#!/usr/bin/env bash
# PRM Core — nocna kopia bazy. Uruchamiana z crona na hoście:
#
#   0 3 * * * /srv/prm-core/scripts/backup.sh >> /srv/prm-core/data/backups/backup.log 2>&1
#
# Kopia trafia do `data/backups/nightly-*.db.gz` obok kopii wydaniowych, które
# robi deploy.sh. Retencja obu jest rozdzielna — patrz scripts/backup.mjs.
#
# UWAGA co do zakresu ochrony: kopia leży na TYM SAMYM dysku co baza. Chroni
# przed błędem w aplikacji, nieudaną migracją i skasowaniem danych przez
# człowieka — czyli przed tym, co zdarza się naprawdę często. NIE chroni przed
# utratą serwera. Na to jest BACKUP_REMOTE poniżej.

set -euo pipefail

cd "$(dirname "$0")/.."

DATA_DIR="${DATA_DIR:-./data}"
BACKUP_DIR="$DATA_DIR/backups"
DB_FILE="$DATA_DIR/prm-core.db"

echo "── $(date '+%Y-%m-%d %H:%M:%S %Z') ─────────────────────────────"

if [[ ! -f "$DB_FILE" ]]; then
	echo "✗ Brak bazy ($DB_FILE) — nie ma czego kopiować."
	exit 1
fi

mkdir -p "$BACKUP_DIR"

# Ścieżka podstawowa: kopia z wnętrza działającego kontenera. Tam jest Bun i
# @libsql/client, więc host nie potrzebuje sqlite3.
if docker compose ps --status running app 2>/dev/null | grep -q app; then
	docker compose exec -T app bun ./scripts/backup.mjs
else
	# Kontener nie działa. To znaczy, że NIKT nie pisze do bazy — a wtedy zwykłe
	# skopiowanie pliku jest bezpieczne i lepsze niż brak kopii tej nocy.
	STAMP="$(date +%Y%m%d-%H%M%S)"
	TARGET="$BACKUP_DIR/nightly-$STAMP.db"
	echo "! Kontener nie działa — kopiuję plik na zimno (baza nie jest w użyciu)."
	cp "$DB_FILE" "$TARGET"
	gzip -9 "$TARGET"
	echo "✓ $(basename "$TARGET").gz · kopia na zimno, bez weryfikacji"
fi

# Kopia poza serwer — włącza się dopiero, gdy ktoś ustawi cel. Format jak w scp:
#   BACKUP_REMOTE=user@backup.host:/kopie/prm-core
# Wymaga klucza SSH bez hasła dla użytkownika, z którego działa cron.
if [[ -n "${BACKUP_REMOTE:-}" ]]; then
	NEWEST="$(ls -1t "$BACKUP_DIR"/nightly-*.db.gz 2>/dev/null | head -1 || true)"
	if [[ -n "$NEWEST" ]]; then
		echo "▸ Wysyłam poza serwer → $BACKUP_REMOTE"
		scp -q -o BatchMode=yes "$NEWEST" "$BACKUP_REMOTE/" && echo "✓ Wysłane" || echo "✗ Wysyłka nieudana — kopia lokalna jest"
	fi
fi
