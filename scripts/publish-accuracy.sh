#!/usr/bin/env bash
#
# publish-accuracy.sh — mirror the FTSO accuracy JSON produced on the box into a
# dedicated, single-file `data` branch on origin so the public site can fetch it
# from raw.githubusercontent.com (same pattern as the on-chain provider list).
#
# It uses git plumbing (hash-object / mktree / commit-tree / update-ref) so it
# NEVER touches your working tree, index, or current branch. The `data` branch is
# kept OUT of main's history — main never merges it. Idempotent: if the JSON is
# byte-identical to what's already published, it skips the commit + push.
#
# Safe to run every 10 minutes from cron/launchd. It only ever force-pushes the
# `data` branch — it never touches `main` and never deploys.
#
# Usage:
#   scripts/publish-accuracy.sh
#
# Env overrides:
#   FTSO_SSH_HOST   ssh host alias for the box            (default: ftso)
#   FTSO_JSON_PATH  path to the JSON on the box           (default: /home/ubuntu/ff-accuracy-feed/ftso-accuracy.json)
#   DATA_BRANCH     branch to publish to                  (default: data)
#   DATA_FILENAME   filename in the branch tree           (default: ftso-accuracy.json)
#   REMOTE          git remote to push to                 (default: origin)
#
set -euo pipefail

FTSO_SSH_HOST="${FTSO_SSH_HOST:-ftso}"
FTSO_JSON_PATH="${FTSO_JSON_PATH:-/home/ubuntu/ff-accuracy-feed/ftso-accuracy.json}"
DATA_BRANCH="${DATA_BRANCH:-data}"
DATA_FILENAME="${DATA_FILENAME:-ftso-accuracy.json}"
REMOTE="${REMOTE:-origin}"

# Resolve repo root so the script works from anywhere.
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

log() { printf '[publish-accuracy] %s\n' "$*" >&2; }

TMP="$(mktemp -t ftso-accuracy.XXXXXX.json)"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

# 1. Pull the JSON off the box.
log "fetching ${FTSO_SSH_HOST}:${FTSO_JSON_PATH}"
if ! ssh -o ConnectTimeout=20 -o BatchMode=yes "$FTSO_SSH_HOST" "cat '${FTSO_JSON_PATH}'" > "$TMP"; then
  log "ERROR: ssh/cat failed — leaving published data untouched"
  exit 1
fi

# 2. Validate it is real, non-empty JSON before publishing (never push garbage).
if [ ! -s "$TMP" ]; then
  log "ERROR: fetched file is empty — aborting"
  exit 1
fi
if command -v python3 >/dev/null 2>&1; then
  if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$TMP" 2>/dev/null; then
    log "ERROR: fetched file is not valid JSON — aborting"
    exit 1
  fi
elif command -v node >/dev/null 2>&1; then
  if ! node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$TMP" 2>/dev/null; then
    log "ERROR: fetched file is not valid JSON — aborting"
    exit 1
  fi
else
  log "WARN: no python3/node found — skipping JSON validation"
fi

# 3. Write the blob into the object db (does NOT touch working tree or index).
BLOB="$(git hash-object -w "$TMP")"

# 4. Idempotency: if the current data branch already points at this exact blob,
#    there is nothing to publish.
PARENT=""
if git show-ref --verify --quiet "refs/heads/${DATA_BRANCH}"; then
  PARENT="$(git rev-parse "refs/heads/${DATA_BRANCH}")"
  EXISTING_BLOB="$(git rev-parse "refs/heads/${DATA_BRANCH}:${DATA_FILENAME}" 2>/dev/null || true)"
  if [ "$EXISTING_BLOB" = "$BLOB" ]; then
    log "no change (blob ${BLOB:0:12}) — skipping commit + push"
    exit 0
  fi
fi

# 5. Build a single-file tree and commit it (no checkout, no working-tree change).
TREE="$(printf '100644 blob %s\t%s\n' "$BLOB" "$DATA_FILENAME" | git mktree)"

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MSG="data: ftso-accuracy.json ${STAMP}"
if [ -n "$PARENT" ]; then
  COMMIT="$(printf '%s\n' "$MSG" | git commit-tree "$TREE" -p "$PARENT")"
else
  COMMIT="$(printf '%s\n' "$MSG" | git commit-tree "$TREE")"
fi

git update-ref "refs/heads/${DATA_BRANCH}" "$COMMIT"
log "committed ${COMMIT:0:12} to ${DATA_BRANCH} (blob ${BLOB:0:12})"

# 6. Force-push ONLY the data branch. Never main. Never a deploy.
log "pushing ${DATA_BRANCH} -> ${REMOTE}"
git push -f "$REMOTE" "refs/heads/${DATA_BRANCH}:refs/heads/${DATA_BRANCH}"
log "done — https://raw.githubusercontent.com/FlareForward/dataproviderwebpage/${DATA_BRANCH}/${DATA_FILENAME}"
