#!/usr/bin/env bash
#
# publish-accuracy.sh — refresh the FTSO accuracy JSON that the site serves as a
# same-origin static asset at /ftso-accuracy.json (public/ftso-accuracy.json).
#
# Why same-origin (not raw.githubusercontent): this repo is PRIVATE, and
# raw.githubusercontent.com 404s for private repos. Serving the file from the
# site's own origin avoids depending on the repo's visibility and needs no token.
#
# What it does: pulls the JSON off the box, validates it's real JSON, and — only
# if it changed — writes public/ftso-accuracy.json and commits it on the CURRENT
# branch. It does NOT push and does NOT deploy (commit-not-push; you deploy).
#
# ⚠️ Freshness tradeoff of same-origin static: the LIVE file only updates when the
#    site is redeployed. So either (a) pair this with your deploy step at whatever
#    cadence you want, or (b) for continuous ~10-min freshness WITHOUT redeploys,
#    serve /ftso-accuracy.json from a Cloudflare Worker backed by KV/R2 and have
#    the box push there — that's the recommended follow-up (see README).
#
# Usage:  scripts/publish-accuracy.sh
# Env overrides:
#   FTSO_SSH_HOST   ssh alias for the box   (default: ftso)
#   FTSO_JSON_PATH  path on the box         (default: /home/ubuntu/ff-accuracy-feed/ftso-accuracy.json)
#   ASSET_PATH      target in this repo     (default: public/ftso-accuracy.json)
#   DO_COMMIT       commit if changed (1)   (default: 1; set 0 to only update the file)
#
set -euo pipefail

FTSO_SSH_HOST="${FTSO_SSH_HOST:-ftso}"
FTSO_JSON_PATH="${FTSO_JSON_PATH:-/home/ubuntu/ff-accuracy-feed/ftso-accuracy.json}"
ASSET_PATH="${ASSET_PATH:-public/ftso-accuracy.json}"
DO_COMMIT="${DO_COMMIT:-1}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

log() { printf '[publish-accuracy] %s\n' "$*" >&2; }

TMP="$(mktemp -t ftso-accuracy.XXXXXX.json)"
trap 'rm -f "$TMP"' EXIT

# 1. Pull the JSON off the box.
log "fetching ${FTSO_SSH_HOST}:${FTSO_JSON_PATH}"
if ! ssh -o ConnectTimeout=20 -o BatchMode=yes "$FTSO_SSH_HOST" "cat '${FTSO_JSON_PATH}'" > "$TMP"; then
  log "ERROR: ssh/cat failed — leaving the published file untouched"
  exit 1
fi

# 2. Validate: non-empty, real JSON, with the expected shape (never publish garbage).
if [ ! -s "$TMP" ]; then log "ERROR: fetched file is empty — aborting"; exit 1; fi
if command -v python3 >/dev/null 2>&1; then
  if ! python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert d.get('feeds') and d.get('summary')" "$TMP" 2>/dev/null; then
    log "ERROR: fetched file is not valid accuracy JSON — aborting"; exit 1
  fi
else
  log "WARN: no python3 — skipping JSON validation"
fi

# 3. Idempotency: skip if byte-identical to what's already on disk.
if [ -f "$ASSET_PATH" ] && cmp -s "$TMP" "$ASSET_PATH"; then
  log "no change — ${ASSET_PATH} already current"
  exit 0
fi

# 4. Update the asset.
mkdir -p "$(dirname "$ASSET_PATH")"
cp "$TMP" "$ASSET_PATH"
log "updated ${ASSET_PATH}"

# 5. Optionally commit on the current branch (no push, no deploy).
if [ "$DO_COMMIT" = "1" ]; then
  STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git add "$ASSET_PATH"
  if git diff --cached --quiet -- "$ASSET_PATH"; then
    log "nothing staged (unchanged in index) — skipping commit"
  else
    git commit -q -m "data: refresh ${ASSET_PATH##*/} ${STAMP}" -- "$ASSET_PATH"
    log "committed on $(git branch --show-current) — push + deploy to publish"
  fi
fi
