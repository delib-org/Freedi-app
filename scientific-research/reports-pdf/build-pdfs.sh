#!/bin/bash
# Regenerates the PDF reports from their markdown sources.
# Pipeline: pandoc (gfm -> standalone HTML + report.css) -> headless Chrome (A4 PDF).
# Requires: pandoc, Google Chrome. No LaTeX needed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RESEARCH="$(dirname "$HERE")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

build() {
  local src="$1" out="$2" title="$3"
  python3 "$HERE/prep.py" "$src" "$TMP/in.md"
  pandoc "$TMP/in.md" --from=gfm --to=html5 --standalone \
    --metadata title="$title" --css="$HERE/report.css" \
    --embed-resources --output="$TMP/in.html"
  "$CHROME" --headless --disable-gpu --no-pdf-header-footer \
    --virtual-time-budget=10000 --print-to-pdf="$out" "file://$TMP/in.html" 2>/dev/null
  echo "  $(basename "$out")  ($(du -h "$out" | cut -f1))"
}

echo "Building reports..."
build "$RESEARCH/20206-07-16-Claim-regestry/REPORT-1-ELJ-ENGINE.md" \
      "$HERE/1-ELJ-engine.pdf" \
      "Deciding Claim Identity Without Trusting Geometry"
build "$RESEARCH/20206-07-16-Claim-regestry/REPORT-2-HYBRID-PREFERENCE-GEOMETRY.md" \
      "$HERE/2-ELJ-plus-preference-geometry.pdf" \
      "Closing the Loop: Preference Geometry and LLM Judgment"
build "$RESEARCH/2026-07-24-delta-support-probe/delta-support-probe-method.md" \
      "$HERE/3-embedded-probe-sampling.pdf" \
      "Embedded Probe Sampling for Measuring Convergence"
echo "Done."
