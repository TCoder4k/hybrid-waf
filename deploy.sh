#!/usr/bin/env bash
# Manual deploy script for the VPS. Run this ON THE VPS, from inside the
# repo directory, after SSHing in — it is NOT a CI/CD pipeline, nothing
# triggers it automatically on `git push`. It's shorthand for the 2 commands
# a deploy always was:
#
#   git pull origin main
#   docker compose -f docker-compose.prod.yml up -d --build
#
# Usage (from the repo root on the VPS):
#   ./deploy.sh
#
# First time only: `chmod +x deploy.sh` after the first `git pull`.
set -euo pipefail

cd "$(dirname "$0")"

# Use docker-compose.prod.yml when present (the VPS's loopback-only-ports,
# real-domain configuration — see that file's own header comment for why
# it's a full standalone file, not an override merged with
# docker-compose.yml) — falls back to the plain dev file so this script
# still works before that file exists in a given checkout.
if [ -f docker-compose.prod.yml ]; then
  COMPOSE=(docker compose -f docker-compose.prod.yml)
else
  COMPOSE=(docker compose)
fi

echo "==> Current commit before pull:"
git log -1 --oneline

# A VPS deploy target should never have local edits to tracked files (only
# untracked .env files, which are gitignored and fine) — if it does,
# something unexpected happened (e.g. a manual hotfix) and pulling blind
# could silently lose it or fail mid-merge. Fail loudly instead.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ERROR: working tree has uncommitted changes to tracked files. Aborting." >&2
  git status --short --untracked-files=no
  exit 1
fi

echo "==> Pulling latest code from origin/main..."
git pull origin main

echo "==> New commit after pull:"
git log -1 --oneline

echo "==> Rebuilding and restarting containers (${COMPOSE[*]})..."
"${COMPOSE[@]}" up -d --build

echo "==> Removing dangling images from the rebuild..."
docker image prune -f

echo "==> Container status:"
"${COMPOSE[@]}" ps

echo "==> Deploy complete."
