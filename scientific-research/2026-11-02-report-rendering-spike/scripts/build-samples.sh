#!/bin/sh
# Builds every sample into ~/Downloads/report-rendering-spike (needs Docker for the Linux Chromium PDFs).
set -e
cd "$(dirname "$0")/.."
D="$HOME/Downloads/report-rendering-spike"
mkdir -p "$D/docx" "$D/pdf-chromium-linux" "$D/pdf-pdfmake-rejected" out/docker
node src/make-fixtures.mjs
for size in short long; do
  for lang in he ar fa; do
    node src/render-docx.mjs "fixtures/$size-$lang.json" "$D/docx/$size-$lang.docx"
    docker/run.sh node src/render-pdf-chromium.mjs "fixtures/$size-$lang.json" "out/$size-$lang.pdf"
    cp "out/docker/$size-$lang.pdf" "$D/pdf-chromium-linux/$size-$lang.pdf"
  done
done
node src/render-pdf-pdfmake.mjs fixtures/short-ar.json "$D/pdf-pdfmake-rejected/short-ar.logical.pdf" logical
node src/render-pdf-pdfmake.mjs fixtures/short-ar.json "$D/pdf-pdfmake-rejected/short-ar.visual.pdf" visual
find "$D" -type f | sort
