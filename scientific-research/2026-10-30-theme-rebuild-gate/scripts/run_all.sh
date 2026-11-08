#!/usr/bin/env bash
# Rebuild the theme layer of the 8 benchmark end states, REPEAT times each.
#   usage: bash scripts/run_all.sh <tag-prefix> [repeat=2]
set -euo pipefail
cd "$(dirname "$0")/.."
PREFIX=${1:-run}
REPEAT=${2:-2}
RUNS="en-seed42-themefix en-seed42-consolidated en-seed7-consolidated en-seed1234-consolidated en-seed42-filingfix he-seed42-large-formulation he-seed42-large-judgedattach he-seed42-large-recall"
for i in $(seq 1 "$REPEAT"); do
  for r in $RUNS; do
    out="results/${PREFIX}${i}/$r"
    [ -f "$out/rebuild-log.json" ] && continue
    node scripts/rebuild.mjs --run=../2026-08-18-live-synth-accuracy/runs/$r --out="$out" 2>&1 | tail -1
  done
done
