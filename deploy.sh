#!/usr/bin/env bash
#
# Deploy script — runs ON the VPS. Pulls latest main. That's it: this is a
# static site, nginx serves the checked-out files directly, no build/process.
#
#   Triggered by:  .github/workflows/deploy.yml  (GitHub → Actions → "Deploy to VPS" → Run workflow)
#   Or by hand:    bash deploy.sh
set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-main}"

cd "$(dirname "$0")"

echo "==> Deploying personal-site from origin/$BRANCH"
git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
# Fast-forward only: bail loudly if the box has local commits that diverge from
# origin, rather than creating a surprise merge commit on a production checkout.
git merge --ff-only "origin/$BRANCH"

echo "==> Done. Nothing to build or restart — nginx serves the files directly."
