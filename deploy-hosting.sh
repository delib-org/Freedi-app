#!/usr/bin/env bash
#
# Guarded hosting deploy.
#
# Twice now a deploy has been run from the primary checkout
# (~/Documents/Freedi-app), which sits on feat/agora-control-panels — so it
# shipped that branch instead of merged main. This refuses to run unless the
# tree it lives in is actually at main's commit.
#
# Usage:
#   ./deploy-hosting.sh              # main app only
#   ./deploy-hosting.sh all          # main app + the seven Firebase-hosted apps
#
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE" || exit 1

HEAD_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse main)"

if [ "$HEAD_SHA" != "$MAIN_SHA" ]; then
  echo "REFUSING TO DEPLOY."
  echo "  this tree : $(git branch --show-current) @ ${HEAD_SHA:0:9}"
  echo "  main      : ${MAIN_SHA:0:9}"
  echo "They differ — you would ship something other than merged main."
  exit 1
fi

echo "tree is at merged main (${HEAD_SHA:0:9}) — proceeding"
echo

run() {
  echo "----------------------------------------------"
  echo " $1"
  echo "----------------------------------------------"
  npm run "$1" || { echo "FAILED: $1"; exit 1; }
}

run deploy:h:prod

if [ "${1:-}" = "all" ]; then
  for t in deploy:admin deploy:agora deploy:chat deploy:flow deploy:join deploy:odyssey deploy:studio; do
    run "$t"
  done
fi

echo
echo "done. sign and mass-consensus deploy via Vercel (push main-sign / main-mc)."
