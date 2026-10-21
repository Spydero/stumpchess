#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EMAIL="${OWNER_EMAIL:-jojo@local.dev}"
PASS="${OWNER_PASSWORD:-OwnerChangeMe123!}"
APP="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"

if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "$ROOT/.env"
  set +a
fi

DB="${DATABASE_URL:-postgresql://stumpchess:stumpchess@localhost:5432/stumpchess}"

curl -s -X POST "$APP/api/auth/sign-up/email" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"jOjo\",\"username\":\"jOjo\"}" >/dev/null || true

cd "$ROOT/packages/db"
DATABASE_URL="$DB" OWNER_EMAIL="$EMAIL" pnpm seed
echo "Owner ready: $EMAIL / $PASS (username jOjo)"
