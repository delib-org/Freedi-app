#!/usr/bin/env bash
# Make an agent's fresh git worktree runnable: env files, .firebaserc, node_modules,
# built shared packages. Mirrors the "GIT WORKTREE SETUP" section of CLAUDE.md.
#
# Usage:  prep-worktree.sh <worktree-path> [--apps=agora,mc,sign,studio,join,odyssey,admin,flow,chat,functions]
#
# Safe to re-run: skips what is already there. Missing optional env files only warn.

set -uo pipefail

ROOT="/Users/talyaron/Documents/Freedi-app"
WT="${1:-}"
APPS=""
for arg in "$@"; do case "$arg" in --apps=*) APPS="${arg#--apps=}" ;; esac; done

if [[ -z "$WT" || ! -d "$WT/.git" && ! -f "$WT/.git" ]]; then
  echo "ERROR: usage: prep-worktree.sh <worktree-path> [--apps=agora,mc,...]  (path must be a git worktree)" >&2
  exit 1
fi
if [[ "$(cd "$WT" && pwd -P)" == "$(cd "$ROOT" && pwd -P)" ]]; then
  echo "ERROR: refusing to run against the shared main tree $ROOT" >&2
  exit 1
fi

copy_if() { # copy_if <relative-file>
  local src="$ROOT/$1" dst="$WT/$1"
  if [[ -f "$dst" ]]; then echo "    (have) $1"
  elif [[ -f "$src" ]]; then mkdir -p "$(dirname "$dst")"; cp "$src" "$dst"; echo "    copied $1"
  else echo "    (skip) missing $1"; fi
}

echo "==> Env files + .firebaserc"
for f in .firebaserc env/.env.dev env/.env.prod env/.env.test env/.env.local \
         env/.env.development.local functions/.env \
         apps/mass-consensus/.env.local apps/mass-consensus/.env apps/mass-consensus/.env.staging apps/mass-consensus/.env.vercel \
         apps/sign/.env.local apps/agora/.env.development.local apps/studio/.env.local apps/join/.env.local \
         apps/odyssey/.env.local apps/admin/.env.local; do
  copy_if "$f"
done

echo "==> Root npm install"
if [[ -d "$WT/node_modules" ]]; then echo "    (have) node_modules"
else ( cd "$WT" && npm install --no-audit --no-fund ) || { echo "ERROR: root npm install failed" >&2; exit 1; }; fi

echo "==> Build shared packages (shared-types, event-core, engagement-core, evidence, deliberation-brain)"
for p in shared-types event-core engagement-core evidence deliberation-brain; do
  if [[ -d "$WT/packages/$p" ]]; then
    ( cd "$WT/packages/$p" && npm run build --silent ) >/dev/null 2>&1 && echo "    built $p" || echo "    (warn) build failed: $p"
  fi
done

install_app() { # install_app <relative-dir>
  local d="$WT/$1"
  [[ -d "$d" ]] || { echo "    (skip) no dir $1"; return; }
  if [[ -d "$d/node_modules" ]]; then echo "    (have) $1/node_modules"
  else ( cd "$d" && npm install --no-audit --no-fund ) && echo "    installed $1" || echo "    (warn) npm install failed in $1"; fi
}

if [[ -n "$APPS" ]]; then
  echo "==> App dependencies"
  IFS=',' read -ra LIST <<< "$APPS"
  for app in "${LIST[@]}"; do
    case "$app" in
      functions) install_app functions ;;
      mc|mass-consensus) install_app apps/mass-consensus ;;
      main|root) ;;  # root already installed
      agora|sign|studio|join|odyssey|admin|flow|chat) install_app "apps/$app" ;;
      *) echo "    (skip) unknown app '$app'" ;;
    esac
  done
fi

echo "==> Ready: $WT  (branch: $(git -C "$WT" branch --show-current))"
