#!/usr/bin/env bash
# Starts KaziForce on the server, or updates it to the latest code on GitHub
# (docs/DEPLOYMENT.md, steps 5 and 9). Run from the repository folder:  bash deploy/azure/update.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "deploy/azure/.env is missing: cp deploy/azure/.env.example deploy/azure/.env, then fill it in." >&2
  exit 1
fi
unfilled=$(grep -vE '^[[:space:]]*#' .env | grep -E 'CHANGE-ME|\[YOUR-PASSWORD\]' | cut -d= -f1 || true)
if [ -n "$unfilled" ]; then
  echo "deploy/azure/.env still has values to fill in:" >&2
  echo "$unfilled" >&2
  exit 1
fi

echo "== Getting the latest code =="
git -C ../.. pull --ff-only

echo "== Building and starting (database migrations run first) =="
docker compose up -d --build --remove-orphans

echo "== Removing old images =="
docker image prune -f >/dev/null

docker compose ps
echo
echo "Check: https://$(grep '^API_DOMAIN=' .env | cut -d= -f2)/health"
