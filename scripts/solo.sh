#!/usr/bin/env bash
# Run any command against THIS worktree's own emulator suite.
#
#   bash scripts/solo.sh npx tsx apps/agora/scripts/seed.ts
#   npm run solo -- node apps/agora/scripts/e2e-cycle.mjs
#
# It only exports the ports from env/ports.solo.sh and then execs what you gave
# it, so nothing here needs to know about the command being run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

set -a
# shellcheck source=../env/ports.solo.sh
source "$ROOT/env/ports.solo.sh"
set +a

if [ "$#" -eq 0 ]; then
	echo "solo: nothing to run. Try: npm run solo -- <command>" >&2
	exit 64
fi

exec "$@"
