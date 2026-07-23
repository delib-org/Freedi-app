#!/usr/bin/env bash
# Provision a fully-working Freedi git worktree for parallel feature development.
#
# Usage:
#   setup-worktree.sh <worktree-name> <branch-name> [base-branch] [--apps=mc,sign,flow]
#
# Example:
#   setup-worktree.sh report-fixes feat/report-fixes main --apps=sign
#
# Steps mirror the "GIT WORKTREE SETUP" section of CLAUDE.md:
#   create worktree -> copy env files -> install deps -> build shared packages.
# Env-file copies are skipped (with a warning) when a source file is absent,
# so this is safe to run even if some optional env files don't exist.

set -uo pipefail

ROOT="/Users/talyaron/Documents/Freedi-app"
WT_BASE="/Users/talyaron/Documents/Freedi-app.worktrees"

WT_NAME="${1:-}"
BRANCH="${2:-}"
BASE="${3:-main}"
APPS=""

for arg in "$@"; do
  case "$arg" in
    --apps=*) APPS="${arg#--apps=}" ;;
  esac
done

# If base-branch position was actually the --apps flag, fix it up.
case "$BASE" in --apps=*) BASE="main" ;; esac

if [[ -z "$WT_NAME" || -z "$BRANCH" ]]; then
  echo "ERROR: usage: setup-worktree.sh <worktree-name> <branch-name> [base-branch] [--apps=mc,sign,flow]" >&2
  exit 1
fi

WT="$WT_BASE/$WT_NAME"

echo "==> Creating worktree '$WT_NAME' on branch '$BRANCH' from '$BASE'"
if [[ -d "$WT" ]]; then
  echo "    worktree dir already exists at $WT — skipping create"
else
  git -C "$ROOT" worktree add "$WT" -b "$BRANCH" "$BASE" || {
    echo "    branch may already exist; retrying without -b" >&2
    git -C "$ROOT" worktree add "$WT" "$BRANCH" || exit 1
  }
fi

copy_env() {
  # copy_env <relative-src> <relative-dest-dir>
  local src="$ROOT/$1"
  local destdir="$WT/$2"
  if [[ -f "$src" ]]; then
    mkdir -p "$destdir"
    cp "$src" "$destdir/"
    echo "    copied $1"
  else
    echo "    (skip) missing $1"
  fi
}

echo "==> Copying env files"
copy_env "env/.env.dev"   "env"
copy_env "env/.env.prod"  "env"
copy_env "env/.env.test"  "env"
copy_env "env/.env.local" "env"
copy_env "functions/.env" "functions"
copy_env "apps/mass-consensus/.env.local"   "apps/mass-consensus"
copy_env "apps/mass-consensus/.env"         "apps/mass-consensus"
copy_env "apps/mass-consensus/.env.staging" "apps/mass-consensus"
copy_env "apps/mass-consensus/.env.vercel"  "apps/mass-consensus"
copy_env "apps/sign/.env.local" "apps/sign"

echo "==> Installing root dependencies"
( cd "$WT" && npm install ) || { echo "    root npm install failed" >&2; exit 1; }

echo "==> Installing functions dependencies"
( cd "$WT/functions" && npm install ) || echo "    (warn) functions npm install failed"

echo "==> Building shared-types"
( cd "$WT/packages/shared-types" && npm run build ) || echo "    (warn) shared-types build failed"

# Optional per-app dependency installs
if [[ -n "$APPS" ]]; then
  IFS=',' read -ra APP_LIST <<< "$APPS"
  for app in "${APP_LIST[@]}"; do
    case "$app" in
      mc)   dir="apps/mass-consensus" ;;
      sign) dir="apps/sign" ;;
      flow) dir="apps/flow" ;;
      *)    echo "    (skip) unknown app '$app'"; continue ;;
    esac
    echo "==> Installing $app dependencies ($dir)"
    ( cd "$WT/$dir" && npm install ) || echo "    (warn) $app npm install failed"
  done
fi

echo "==> Done. Worktree ready at: $WT"
echo "    Open it in a new editor/terminal, or run:  cd $WT && npm run dev"
