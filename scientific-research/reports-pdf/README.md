# PDF reports

Typeset versions of the research reports. Regenerate with `./build-pdfs.sh`
(requires `pandoc` and Google Chrome; no LaTeX).

| PDF | Source | Subject |
|---|---|---|
| `1-ELJ-engine.pdf` | `../20206-07-16-Claim-regestry/REPORT-1-ELJ-ENGINE.md` | The Embedding + LLM-Judge architecture: why cosine cannot decide claim identity, and what replaces it |
| `2-ELJ-plus-preference-geometry.pdf` | `../20206-07-16-Claim-regestry/REPORT-2-HYBRID-PREFERENCE-GEOMETRY.md` | Combining ELJ with Blair/Procaccia/Tambe preference tuning — four hybrid architectures and the learning loop |
| `3-probe-sampling-convergence.pdf` | `../2026-07-24-delta-support-probe/delta-support-probe-method.md` | Embedded probe sampling for measuring convergence on leading proposals during live deliberative events || `4-heschel-real-data-case-study.pdf` | `../2026-08-18-live-synth-accuracy/REPORT-Heschel-real-data-case-study.md` | The first real-data test: the Heschel Center question (`Bq-VQPMPiG7b`, 114 Hebrew statements) replayed, blind-audited, fixed and re-audited |

`report.css` controls typography; `prep.py` forces line breaks in the metadata
block (pandoc's gfm reader collapses single newlines).
