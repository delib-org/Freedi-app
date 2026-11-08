# Geometry Proposes, Judgement Disposes — ICLR 2027 submission draft

LaTeX sources for the paper on Freedi's live clustering/synthesis engine (the judged
placement cascade + claim registry), its evaluation on Blair, Procaccia & Tambe's hard
triplets, the live EN/HE benchmark, the production replay, and the LLM-only baselines
(`../2026-09-04-llm-only-baseline/`).

Build: `pdflatex paper && bibtex paper && pdflatex paper && pdflatex paper`
(TeX Live 2026; uses the official ICLR 2027 style files included here).

- `paper.tex` — main text + appendices; `\iclrfinalcopy` is commented out, so the PDF
  renders anonymised for double-blind review. Uncomment for the camera-ready.
- `llm_baseline.tex` — §5.5 (LLM-only baselines), `\input` by paper.tex.
- `references.bib` — bibliography.
- `paper.pdf` — current anonymised build (submission form).
- `paper-with-authors.pdf` — same build with `\iclrfinalcopy` on, showing the author block.

ICLR 2027 deadlines: abstract 18 Sep 2026, paper 25 Sep 2026 (AoE). Main-text limit is a
strict 9 pages at submission (10 at camera-ready); the current build's main text ends
on page 9 with statements/references/appendices after.

Every number in the paper traces to a committed artefact:
- hard triplets: `../20206-07-16-Claim-regestry/` (benchmark/RESULTS.md, PILOT150-RESULTS.md, RECALL_GAP.md, TEST_REPORT.md)
- live benchmark: `../2026-08-18-live-synth-accuracy/RESULTS.md`
- production replay + blind audit: `../2026-08-18-live-synth-accuracy/runs/bq-replay-*/verification/`
- LLM-only baselines: `../2026-09-04-llm-only-baseline/RESULTS.md`
- verdict-cache cost incident: memory note `synthesis-verdict-cache-cost` (commits 746b2c183, 6d4714dfc)
