# Per-run pipeline diagnostics

Occurrence counts of `logger` calls in `functions/src/synthesis/`, grepped from
each run's functions-emulator log.

**The emulator logs themselves are NOT preserved** — they lived in a disposable
session scratchpad at 3-5 MB each. This file is the durable record of what the
pipeline internals did, extracted before they were lost. The per-decision record
*is* preserved, in each run folder's `audit.json`.

| signal | r1 cohesion | r2 passorder† | r3 precision | r4 llm-themes | r5 consolidated | seed 7 | seed 1234 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `synthesis.pipeline.spawn` | 16 | 62 | 63 | 50 | 50 | 50 | 50 |
| `spawn: debounced` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `spawn: failed, re-queued` | 0 | 11 | 11 | 0 | 0 | 0 | 0 |
| `spawn: deduped` | 15 | 11 | 11 | 0 | 0 | 0 | 0 |
| `synthesis.pipeline.attach` | 66 | 21 | 19 | 7 | 8 | 8 | 6 |
| `topicAttach.cohesionRejected` | 191 | 181 | 205 | 107 | 96 | 101 | 164 |
| `attach.cohesionRejected` | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| `attach.titleOnlyRejected` | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| `synthesis.pipeline.nest` | 0 | 50 | 49 | 31 | 29 | 34 | 29 |
| `nest.themeCreated` | 0 | 0 | 0 | 19 | 21 | 16 | 21 |
| `optionThemed` | 0 | 0 | 0 | 0 | 7 | 7 | 6 |
| `stageB.promotions` | 0 | 27 | 23 | 12 | 17 | 27 | 23 |

† `r2 passorder` is build-contaminated (see RESULTS.md) — its counts mix two builds.

## Reading these

- `spawn: debounced` is **0 in every run**. The spawn debounce has never fired at
  shipped settings across seven runs; the string `debounc` never appeared in any log.
- `attach.titleOnlyRejected` fired **once in seven runs**, on a marginal case
  (title 0.852, members 0.836, gate 0.85). Correctly calibrated, but it is not what
  recovered precision — the reJudge member-evidence gate was.
- `topicAttach.cohesionRejected` staying high (96-205) while the score rose is
  expected: it is cosine refusing to answer a question cosine cannot answer, with
  the LLM judge picking up the placement afterwards.
- The reJudge judge's own refusals are NOT here — the sweep runs in a separate
  process whose stdout the emulator never sees. They are in `pumps.log` in the
  seed-7 and seed-1234 run folders (5 refusals across 3 sweeps on seed 7).
