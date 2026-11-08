# Report rendering spike: RTL DOCX + PDF (2026-11-02)

Phase 0 "Rendering spike" of `plans/admin-create-report.md`. Standalone folder, own `package.json`, nothing under `functions/` or `src/` touched, nothing deployed. All sample text is invented.

## Recommendation

- **PDF: headless Chromium from HTML** (`puppeteer-core` + `@sparticuz/chromium`). It is the only option tested that gets Arabic joining, Persian letters, bidi word order, digit order and RTL table column order right without custom code. pdfmake (pdfkit + fontkit) shapes letters but has no bidi algorithm; it fails on word order, or, if you pre-reorder, on joining. See "pdfmake test".
- **DOCX: `docx` library**, with the RTL settings below plus a small XML patch (section-level `w:bidi`, paragraph default).
- **Put both in a separately deployed functions codebase** (own `package.json`, 2 GiB, 540 s) with lazy `import()`. Reasons: +105 MB of Chromium deps (the main functions prod `node_modules` is already ~548 MB), `AWS_EXECUTION_ENV` env hack needed only here, the 2 GiB size only needed here.

## Comparison

| Option | Arabic/Persian shaping | Hebrew/Arabic bidi order | Table RTL | Peak memory (2 GiB cgroup, 40 pp) | Wall time (40 pp, cold container, amd64 emulated) | Added to node_modules |
|---|---|---|---|---|---|---|
| Chromium HTML to PDF | OK (looked at he/ar/fa, Linux and macOS Chrome) | OK | OK (plain `dir="rtl"` table, first column on right, header repeats) | 635-665 MB (cgroup, includes /tmp tmpfs) | 3.1-3.6 s at 2 CPUs; 4.9 s at 1 CPU | 105 MB (67 MB is the brotli Chromium bundle) |
| pdfmake (logical text) | Letters join | WRONG (words in LTR order) | Manual column reversal needed | 80 MB | 1.3 s | 37 MB |
| pdfmake + bidi-js pre-reorder | WRONG (isolated forms, joins broken) | order right, wrapping wrong | manual | same | same | +bidi-js |
| pdf-lib + fontkit | NOT TESTED. Same by construction as pdfmake: fontkit shapes, nothing does bidi | | | | | |
| DOCX (`docx`) | n/a (Word shapes) | via `w:bidi`/`w:rtl` | `w:bidiVisual`, verified in XML and by LibreOffice | 88-91 MB | 0.8-0.9 s | 23 MB (+jszip 3 MB for the patch) |

Cold-start of dependencies (import time, node 22, emulated amd64): puppeteer-core ~170-220 ms, `@sparticuz/chromium` import ~10 ms but `executablePath()` unpacks the bundle to /tmp in 0.65-1.2 s, Chromium launch 0.8-1.0 s, docx ~40 ms, pdfmake ~85 ms. Bare `node -e 1` baseline: 24 MB, 0.18 s. A cold PDF job is therefore about 2 s of fixed cost plus ~1 s to render 40 pages.

## Measured and unmeasured

Measured (Docker Desktop, `linux/amd64` image `node:22-bookworm-slim` on an arm64 Mac, so emulated; `--memory 2g --memory-swap 2g`; fresh container per run, peak taken from `/sys/fs/cgroup/memory.peak`):

- Fixture: 40 pages, 150 table rows (6 tables of 25), 504 paragraphs, per language. Output PDF 630-770 KB, DOCX ~29 KB.
- Chromium PDF: peak 635-665 MB, 3.1-3.6 s. 1 CPU: 4.9 s, 655 MB. Process RSS of Node itself only ~170 MB; the rest is Chromium plus the ~120 MB the bundle unpacks to /tmp (tmpfs counts against the memory limit on Cloud Functions too).
- Chromium is not memory-hungry here; 1 GiB would likely work for this size, 2 GiB leaves headroom for 100+ page reports. Not tested at 1 GiB.

UNMEASURED:

- Anything on a real Cloud Functions 2nd gen instance in me-west1 (cold start of the real container, real /tmp behavior, real CPU share, real Ubuntu base image). Owed step: deploy the spike function to freedi-test only, with `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x`, and call it once per language. Not done, per instructions.
- Native amd64 timing (the Mac emulates; the numbers are probably pessimistic but may also hide real CPU limits).
- Word, Google Docs, Pages (see human checklist).
- pdf-lib + fontkit (reasoned, not run).
- Cloud Functions 2nd gen size limits: from memory only, not verified against current docs. Source upload limit is 100 MB compressed (the CLI does not upload `node_modules`; Cloud Build installs them), the container image is allowed to be large (GBs), so 105 MB extra is not a hard limit problem. Verify before relying on it.
- The current functions bundle: I installed `functions/` prod deps from its lockfile in a scratch directory: 548 MB `node_modules` (googleapis 195 MB, @sentry 96 MB, pdf-parse 34 MB, typescript 23 MB). `functions/lib` was not built, so compiled output size is unmeasured.
- Hebrew/Arabic with Windows/Mac Word-specific font fallbacks, long right-to-left footnotes across page breaks.

## DOCX: exact RTL settings that worked

Verified by unzipping and reading `word/document.xml`, `styles.xml`, `footnotes.xml`, `footer1.xml`, and by converting to PDF with LibreOffice.

| Layer | docx option | XML result |
|---|---|---|
| Every paragraph (body, headings, table cells, footnotes, footer) | `bidirectional: true` | `<w:pPr><w:bidi/>` |
| Every run | `rightToLeft: true` | `<w:rtl/>` |
| Fonts | `font: { ascii, hAnsi, cs, eastAsia: 'Arial' }` | `<w:rFonts ... w:cs="Arial">`. The `cs` slot is the one Word uses for Hebrew/Arabic |
| Sizes and bold | `size` + `sizeComplexScript`, `bold` + `boldComplexScript` | `w:sz`+`w:szCs`, `w:b`+`w:bCs`. Without the `Cs` variants Word ignores size/bold on RTL text |
| Language | `language: { value: 'en-US', bidirectional: 'ar-SA' }` | `<w:lang w:val="en-US" w:bidi="ar-SA"/>` |
| Table | `visuallyRightToLeft: true` | `<w:tblPr><w:bidiVisual/>`. First column is rendered on the right. Cell paragraphs also need `bidirectional` |
| Alignment | leave unset (start) for body; `CENTER` for numeric cells | do NOT use `AlignmentType.LEFT/RIGHT`: they are absolute and the docx docs say so. Unset means "start" which is the right edge in a bidi paragraph |
| Document defaults | `styles.default.document.run` with the same run settings | `docDefaults/rPrDefault` carries `w:rtl`, `w:lang w:bidi` |
| Section | **not supported by docx 9.15**: patched after packing, insert `<w:bidi/>` before `<w:docGrid` in each `w:sectPr` | page becomes RTL (page-number side, columns, gutter) |
| Paragraph default | patched: `<w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault>` in `styles.xml` | new paragraphs the editor types stay RTL (Sigal edits these files) |
| Page numbers | `PageNumber.CURRENT` / `TOTAL_PAGES` in a footer paragraph that is `bidirectional`, runs `rightToLeft` | PAGE / NUMPAGES fields |
| Footnotes | `footnotes: {id: {children: [bidi paragraph]}}` + `FootnoteReferenceRun(id)` | real Word footnotes |

The patch is in `src/render-docx.mjs` (uses `jszip`, already a docx dependency; listed explicitly in `package.json`).

LibreOffice reading of the generated DOCX (weaker evidence than Word; LibreOffice, not Word, and it substitutes Arial): tables render with the first column on the right, header row right-to-left, digits and the Latin word stay in the correct order inside RTL sentences, Persian digits intact, real footnotes at the page bottom, "page 1 of 2" footer centred. See `~/Downloads/report-rendering-spike/docx-as-read-by-libreoffice/`.

### Human checklist (Word and Google Docs; I could not open either)

Open `~/Downloads/report-rendering-spike/docx/short-{he,ar,fa}.docx`, then `long-ar.docx`:

1. The first table column ("topic") is on the RIGHT, then pro, neutral, against, total moving left. Click into the table: Table Properties should show "Right-to-left" direction. In Google Docs check the same by looking at the order.
2. Body text is right-aligned and the first line starts at the right margin. Place the cursor in a paragraph: the paragraph mark should show RTL direction (Word: Home > RTL button highlighted).
3. In a paragraph with a Latin word ("Freedi") and numbers ("37", "69%", the year): word order reads correctly, the percent sign sits next to its number, and the sentence's final period is at the left end.
4. Arabic letters are joined; Persian letters (پ چ ژ گ ک ی) appear correct, not Arabic yeh/kaf shapes.
5. Footnote numbers appear at the bottom of the page, text right-aligned.
6. Footer "page N of M" is centred and the numbers are right (they should update when you add text; press F9 if showing placeholders).
7. Type a new paragraph at the end: it should come out RTL, not LTR.
8. Check the font: if Arial looks wrong for Arabic on the reader's machine, Word will fall back silently (see gotchas).
9. Hebrew with Mac Word and Word online if available; Google Docs usually ignores `w:bidiVisual` on import in some versions, so Docs table order is the highest-risk check.

## PDF: Chromium details

- `src/html.mjs` builds one HTML string per fixture: `<html lang dir="rtl">`, `@font-face` fonts embedded as base64, table with default `dir` inheritance. No special table handling is needed; the browser's table layout goes right-to-left because of `dir`.
- Page numbers: CSS `@page { @bottom-center { content: counter(page) " of " counter(pages) } }`. Works in Chromium 138 (Chrome 131+), uses the page's own fonts, so it avoids the `footerTemplate` trap where the template cannot use `@font-face` fonts. Rendered "page 3 of 40" correctly in all three languages.
- Page header/footers via `displayHeaderFooter` were deliberately not used for that reason.
- Checked by rasterizing and looking: Hebrew, Arabic, Persian first pages on macOS Chrome and Linux `@sparticuz/chromium`; a middle page of `long-fa`. Letters joined, Persian letters right, tables right-to-left with the first column on the right, digits in order, nothing mirrored, no tofu.

### pdfmake test

`src/render-pdf-pdfmake.mjs`, Arabic short fixture, samples in `pdf-pdfmake-rejected/`:

- logical string: Arabic letters join (fontkit shapes) but pdfmake lays words left to right, so every sentence is reversed word by word and "Freedi." punctuation lands wrong.
- reordered with bidi-js: sentence order right, letters all in isolated (non-joined) forms because fontkit shapes the already-reversed string. Wrapping a pre-reversed paragraph also breaks the line order. Table columns had to be reversed by hand in both.
- Conclusion: workable only with a custom shaping+bidi layout layer. Not worth it.
- Smaller, fast, no Chromium: 1.0 s, 80 MB peak. If a Latin-only or short-label report is ever needed this is a fallback; not for Hebrew/Arabic/Persian.

## Fonts

All SIL Open Font License 1.1 (Noto fonts, google/fonts repo). Downloaded by `scripts/fetch-fonts.sh` into `fonts/` (git-ignored, not committed).

| File | Used for | Size |
|---|---|---|
| NotoSansHebrew.ttf (variable) | Hebrew | 113 KB |
| NotoNaskhArabic.ttf (variable) | Arabic and Persian | 308 KB |
| NotoSans.ttf (variable) | Latin words and digits inside RTL text | 2.0 MB (a static Regular+Bold subset would be ~100 KB) |
| NotoSansArabic.ttf (variable) | downloaded, not used (not compared) | 845 KB |

Production asset size with the three used fonts: about 2.5 MB as-is, ~0.6 MB with a Latin subset. Noto Naskh Arabic contains the Persian letters; no separate Persian font was needed. DOCX does not embed these: it names Arial and relies on the reader having it.

## Gotchas

1. **`@sparticuz/chromium` fails on non-Lambda Linux** with `libnspr4.so: cannot open shared object file`. It only unpacks its bundled shared libraries (`al2023.tar.br`) when `AWS_EXECUTION_ENV` or `AWS_LAMBDA_JS_RUNTIME` contains `20.x`/`22.x` (or on Vercel). Setting `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x` in the function environment fixed it on Debian bookworm. Must be confirmed on a real Cloud Functions instance (owed).
2. The Chromium bundle unpacks ~120 MB into `/tmp`, which is an in-memory filesystem on Cloud Functions and counts toward the memory limit. Reuse the browser across requests in a warm instance, but close pages.
3. Variable TTFs print into the PDF as Type 3 fonts (`pdffonts`). Text is still selectable and searchable (uni=yes), but files are bigger and a few viewers render Type 3 slightly less crisply. Fix: generate static instances with `fonttools varLib.instancer` and ship those. Not tested.
4. docx 9.15 has no section-level `bidi` and no paragraph default; patch the XML after packing (see above). Do not rely on the library alone.
5. Never use `AlignmentType.LEFT/RIGHT` in RTL paragraphs; they are absolute, `START` or unset follows direction.
6. Without the `*ComplexScript` size/bold options Word ignores size and bold on Hebrew/Arabic.
7. Word does not embed fonts; a font named in DOCX that the reader lacks gets substituted. Arial covers all three scripts on Windows and macOS Word; Noto stays on the PDF side.
8. The `footerTemplate` of `page.pdf()` cannot load page fonts; use `@page` margin boxes instead.
9. Sandbox: Chromium needs the flags from `@sparticuz/chromium` `args` as used here. Run with `headless: 'shell'`.
10. In the fixtures Persian prose uses Latin digits for counters while table cells use Persian digits (my generator's choice). A real report should convert all numbers per locale in one place.
11. `docker/run.sh` caps at 2 CPUs by default; Cloud Functions gives 1 vCPU at 2 GiB, which is the 1 CPU row.

## Reproduce

```bash
cd scientific-research/2026-11-02-report-rendering-spike
npm install
npm run fonts && npm run fixtures
node src/render-docx.mjs fixtures/short-ar.json out/short-ar.docx
node src/render-pdf-chromium.mjs fixtures/short-ar.json out/short-ar.pdf --local   # macOS Chrome; CHROME_PATH to override
docker build --platform linux/amd64 -t spike-render -f docker/Dockerfile .
docker/run.sh node src/render-pdf-chromium.mjs fixtures/long-ar.json out/long-ar.pdf   # needs Docker
sh scripts/build-samples.sh   # all samples into ~/Downloads/report-rendering-spike
```

`docker/Dockerfile.libreoffice` builds the (weak) DOCX check image: `soffice --headless --convert-to pdf`.
