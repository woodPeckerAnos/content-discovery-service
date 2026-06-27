#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="${POSTGRES_CONTAINER:-postgres}"
DB_USER="${POSTGRES_USER:-dev}"
DB_NAME="${POSTGRES_DB_NAME:-content_discovery}"

for f in "$ROOT"/migrations/*.sql; do
  base="$(basename "$f")"
  applied="$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT 1 FROM schema_migrations WHERE version = '$base' LIMIT 1" 2>/dev/null || true)"
  if [[ "$applied" == "1" ]]; then
    echo "skip $base (already applied)"
    continue
  fi
  echo "apply $base"
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$f"
  docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c \
    "INSERT INTO schema_migrations (version) VALUES ('$base') ON CONFLICT DO NOTHING;"
done

echo "migrations done"
