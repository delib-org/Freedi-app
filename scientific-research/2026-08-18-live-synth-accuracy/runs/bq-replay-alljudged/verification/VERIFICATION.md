# Verification audit of the Bq-VQPMPiG7b production replay

**Date:** 2026-08-24 · **Run audited:** `runs/bq-replay-alljudged` (114 real Hebrew
statements, all-judged build, 3-large pin) · **Verdict up front: the structural
improvement over production is real, but on real data the pipeline is far below its
benchmark numbers on all three quality axes — merge precision, recall, and text
fidelity.**

The case study honestly said "structure, not a score" because a real question has no
ground truth. This audit substitutes ground truth with **independent blind judgement**:
every merge decision and every non-merge was re-judged by auditors that had no access to
the pipeline's reasoning, its titles, or its synthesis texts — applying the pipeline's
own published rubric ("same" = interchangeable proposals; same topic ≠ same proposal;
doubt → related).

## Method

Three instruments, two of them from a **different model family** than the pipeline's
judge (which breaks the circularity of LLM-judging-LLM):

1. **Merge audit** — two independent Claude agents, blind to titles/synthesis texts and
   to each other, judged all 34 member statements across the 11 syntheses:
   is each member interchangeable with the group's core proposal? Adversarial framing
   (instructed to refute; doubt → wrong merge). Artifacts: `audit-A.json`, `audit-B.json`.
2. **Missed-merge sweep** — two independent Claude agents read all 80 un-merged
   statements and hunted for (a) statements that are the same proposal as an existing
   synthesis (missed attach) and (b) un-merged pairs that are the same proposal as each
   other (missed spawn). Strict rubric, doubt → no merge. Artifacts: `sweep-A.json`,
   `sweep-B.json`.
3. **Text fidelity** — the study's own `textFidelity.mjs` (OpenAI `gpt-5.6-terra` judge,
   instrument selftest 8/8 before use) scored what each of the 11 published synthesis
   texts preserves of its members' asks.

Only findings **agreed by both independent judges** are counted below; single-judge
findings are listed as contested.

## Result 1 — Merge precision: 22 of 34 members correctly merged (65%)

Benchmark comparison: the certified HE benchmark run had **precision 1.000, zero false
merges**. On real data, both auditors independently refuted **the same 11 members**
(one further member contested, A:related / B:same):

| synthesis | verdict | wrongly merged members (both judges) |
| --- | --- | --- |
| `GuKRYnGq1BHF` "מנו גורם מוביל ומחויב…" (8 members) | **contaminated** | 6 of 8: the appoint-a-leader core absorbed "שיתוף פעולה מוצלח" (a fragment), "שילוב ידע ומעורבות" (a goal), "הימנעות ממגדל השן" and "שיתוף פעולה עם משתמשי קצה" (a *different* intervention: include end-users), "הפיכת כוח המחקר לפרקטי" and "חיזוק המחקר היישומי" (goals, not this mechanism) |
| `HtoFP5OZXf7Y` "תמריצים ותמיכות כלכליים" (4) | contaminated | 2: "מתן תמריצים" (incentives ≠ funding the research) and "קשור לתועלת כלכלית" (fragment) |
| `WyjLk5LjtRi8` "וובינרים קבועים" (2) | contaminated | 1: "ואקום של מידע" — a **problem** merged with a solution |
| `i0tYvLJSSfSV` "שאלות מחקר מהבנת השטח" (4) | contaminated | 1 (+1 contested): "הכוח של מחקר מהשטח" (heading-like framing) |
| `nbzPaaenT7Ze` "שלבו את הציבור" (2) | contaminated | 1: "מחקר יכול להניע דברים גדולים" — a sentiment, judged *different*, not even related |
| other 6 syntheses | **clean** | — |

The dominant failure is the known **snowballing** mode: `GuKRYnGq1BHF` is a live
instance of the "safe settlement" attractor described in the design docs — a synthesis
whose abstracted title made neighbours look like paraphrases. The judged attach gate did
not stop it on real data.

## Result 2 — Recall: 11 missed attaches + 5 missed spawn pairs, 19 of 21 silent

Both sweepers independently converged on **the same 11 missed attaches** (B added 1
contested) and **the same 5 missed spawn pairs** — ~21 statements (26% of the un-merged
pool) that should have been grouped:

- Missed attaches include **near-verbatim duplicates of existing members** — e.g.
  `WhkvOtCbkAKe` ("להכיר מקום בכמה שכבות של מידע") and `isa7d2T0b3eH` (bottom-up field
  research) duplicate members of `i0tYvLJSSfSV`; `SEqM-zrDfQMN`/`zbGJeUy3tPiV`
  (accessible language) duplicate `HAXXewQ6LF86`.
- Missed spawns: citizen-science pair, trans-disciplinary-research pair,
  researcher-practitioner-meetings pair, science+passion pair, standing-field-feedback
  pair.
- **Crucially, only 2 of these 21 statements sit in the review queue.** The other 19 are
  silent misses — filed under a theme or left unplaced with no flag. The "27 deliberately
  left open" framing in the case study is therefore only partly honest uncertainty.
- Sweepers' restraint check: both independently *rejected* the tempting
  science-in-government cluster (chief scientist / advisory body / Mimshak alumni — same
  goal, three distinct mechanisms), which is evidence they applied the strict rubric
  rather than over-proposing.

Note: this run had `claimRegistryEnabled` **off** (default). The near-verbatim misses are
exactly the semantic-recall gap the registry was built to close; this is the first
real-data confirmation of that motivation.

## Result 3 — Text fidelity: 0.647 (benchmark: 1.000)

`textFidelity.mjs` on the 11 published texts: **22 preserved / 9 weakened / 3 lost** of
34 member asks, and **2 syntheses carry fabricated commitments** (obligations no member
asked for — the accessibility synthesis added public participation in debate; the
incentives synthesis added barrier-removal and tool-selection mechanisms). All 3 *lost*
voices are inside `GuKRYnGq1BHF` — the same synthesis both blind auditors condemned.
Convergent evidence from two model families and two instruments.

## What this changes

1. **Do not treat the benchmark numbers (≈0.93, precision 1.000, fidelity 1.000) as the
   production expectation.** On the first real question: member-level precision ~0.65,
   ≥21 missed groupings, fidelity 0.647. The clean-corpus caveat in `analysis/README.md`
   was correct and is now quantified.
2. **The replay is still clearly better than production's current state** (one 24-member
   fake synthesis, one 59-member flat blob). The before/after comparison in the case
   study stands. What does not stand is the implication that the 11 syntheses are
   individually trustworthy.
3. **Before migrating `Bq-VQPMPiG7b` (or shipping 3-large broadly):**
   - fix or split `GuKRYnGq1BHF` — it accounts for 6/12 wrong members and 3/3 lost voices;
   - investigate why the attach/spawn judge accepted the 11 refuted members (prompts vs.
     gates), and why 19 real duplicates produced no candidate or were refused;
   - re-run the fidelity scorer as a standard post-run gate (it caught everything here);
   - consider the claim registry for real questions — this run is its strongest
     real-data justification yet.
4. **Two items for human adjudication** (single-judge disagreements):
   `4IwTYx4688hA` in `i0tYvLJSSfSV` (A: related, B: same) and
   `Gydh9Qhea4B9` → `HAXXewQ6LF86` (B only, medium confidence).

## Caveats

- The auditors are Claude-family models; the pipeline judge is OpenAI. Cross-family
  disagreement is signal, not proof — but two blind judges agreeing on 11/12 refutations,
  corroborated by an OpenAI fidelity judge on the worst synthesis, is far beyond chance.
- 17 statements hit the harness's 45s settle cap in this run (benchmark runs: ~3), so a
  few end-state placements may be harness artifacts rather than pipeline decisions.
- One run, one question, LLM nondeterminism — numbers are indicative, not calibrated.

**Provenance:** judge inputs (`bq-synths.json`, `bq-nonmerged.json`) and outputs
(`audit-A/B.json`, `sweep-A/B.json`) in this folder; fidelity verdicts cached in
`scripts/.cache/text-fidelity-judge.jsonl`; run parameters in `../results.json`
(gitSha `8b4f1f9ad`, seed 42, 3-large override).
