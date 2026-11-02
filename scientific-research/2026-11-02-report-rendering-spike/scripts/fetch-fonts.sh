#!/usr/bin/env bash
# Downloads the SIL OFL fonts used by the spike into ./fonts (not committed).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p fonts
BASE="https://github.com/google/fonts/raw/main/ofl"
get() { [ -s "fonts/$2" ] || curl -fsSL -o "fonts/$2" "$BASE/$1"; }
get "notosanshebrew/NotoSansHebrew%5Bwdth,wght%5D.ttf" NotoSansHebrew.ttf
get "notonaskharabic/NotoNaskhArabic%5Bwght%5D.ttf" NotoNaskhArabic.ttf
get "notosansarabic/NotoSansArabic%5Bwdth,wght%5D.ttf" NotoSansArabic.ttf
get "notosans/NotoSans%5Bwdth,wght%5D.ttf" NotoSans.ttf
ls -l fonts
