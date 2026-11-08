#!/bin/bash
# Regenerates data/sigal_partition.json and results/metrics.json from the raw folder.
# usage: run_all.sh <rawDir>   (rawDir holds resident text and stays outside the repo)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; RAW="$1"
python3 -I "$HERE/build_partition.py" "$RAW" "$HERE/../data/sigal_partition.json"
python3 -I "$HERE/analyze.py" "$RAW" "$HERE/.." "$RAW/replay"
