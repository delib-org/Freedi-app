#!/bin/bash
# 3 repeats x 2 arms x 2 questions. usage: run_replay.sh <rawDir>
export HERE_DIR="$(cd "$(dirname "$0")" && pwd)"; export RAW_DIR="$1"
for q in IqKVla0ZHw-m WfkDISMmbduQ; do for a in ${ARMS:-R F P}; do for n in 1 2 3; do echo "$q $a $n"; done; done; done |
  xargs -P 4 -L 1 bash -c 'node "$HERE_DIR/replay.mjs" --raw="$RAW_DIR" --q="$0" --arm="$1" --n="$2" 2>&1 | grep -E "themes|rror" | tail -2'
