# First Contact with Real Data: The Heschel Center Research-to-Impact Question

### How the judged synthesis pipeline behaved on 114 real statements from ecology researchers, what a blind audit found, and what one round of fixes changed

**Authors:** Tal Yaron, Claude (Anthropic)
**Date:** 2026-09-04 (consolidating work of 2026-08-21 to 2026-08-25)
**Question:** `Bq-VQPMPiG7b` — *"אילו תנאים וגורמים שזיהיתם יאפשרו לרתום את כוחו של המחקר לשינוי המציאות?"* ("Which conditions and factors that you identified would let the power of research change reality?")
**Event:** a deliberation run with the Heschel Center for Sustainability (מכון השל), whose participants were ecology and environmental researchers; 114 statements collected 2026-07-08 to 07-10
**Companions:** `REPORT-BqVQPMPiG7b-case-study.pdf` (structure before and after, 2026-08-21); `runs/bq-replay-alljudged/verification/VERIFICATION.md` and `runs/bq-replay-fixed/verification/VERIFICATION.md` (the two blind audits, 2026-08-24); §9.3 of `reports-pdf/2026-08-24-geometry-proposes-judgement-disposes.pdf`

---

## Summary

Every accuracy number the synthesis pipeline had earned before August 2026 came from a clean synthetic corpus: exactly two paraphrases per idea, no noise, no real participants. The Heschel Center question was the first time the pipeline met real data, and we treated it as a test rather than a demonstration. We exported the question read-only from production, replayed its 114 Hebrew statements in their original arrival order through the new all-judged build, and then, because a real question has no answer key, we had the result audited blind by judges from a different model family than the pipeline's own.

Three things came out of it.

1. **The structure improved a great deal over what production had built.** Production had left the question with one flat theme of 59 statements, one 24-member "synthesis" that was really a topic, and 14 statements silently unplaced. The replay produced eleven precise syntheses of two to eight members, two themes, and 27 statements deliberately left open. The old 24-member blob reappeared as one proposal holding exactly its two true paraphrases.

2. **The benchmark numbers did not transfer.** On the clean corpus the pipeline had merge precision 1.000 and text fidelity 1.000. On the real question, blind auditors measured member-level merge precision of 65%, found 21 missed groupings of which 19 were silent, and measured text fidelity of 0.647. One eight-member synthesis had snowballed: six of its eight members did not belong, and all three lost participant voices were inside it.

3. **One round of fixes, aimed at the mechanisms the audit exposed, moved every axis.** After a transitivity check on the merge sweep, a revisit pass, and two clauses in the synthesis writer, the same 114 statements replayed to precision 74%, no synthesis larger than four members, 43 statements grouped instead of 34, fidelity 0.953 with no voice lost, and no silent misses at all. Every remaining miss is now a visible judge refusal or a pair waiting for another sweep round.

We report the 74%, not the benchmark's 100%, as the number a real question should expect. The fixes were deployed to production on 2026-08-25. As of the last record, the question itself has not yet been migrated to the new configuration.

---

## 1. Why this question

The live-synthesis accuracy programme (`RESULTS.md`, Findings 1–19) had taken the pipeline from a composite score of 0.067 to 0.88–0.93 on a 100-statement benchmark, with the synthesis layer exact and order-independent. The programme's own analysis notes warned that its thresholds had been calibrated to that corpus's geometry and that the numbers should not be read as a production expectation. A test on real data was owed.

The Heschel Center question was the right first test for three reasons. It was in Hebrew, which is the language where geometry alone had failed hardest. It was a focused question, so most of its 114 statements share one broad area and the pipeline had to separate proposals that are genuinely close. And production had already processed it once, with the older cosine-first pipeline, so there was a before to compare against.

## 2. Method

**Export and replay.** `exportProdQuestion.ts` read the question tree from production without writing anything. The 114 visible statements were ordered by creation time and fed one at a time through `runSinglePipeline` on a local emulator, using two harness flags added for real-question replays (`--in-order`, `--no-validate`). Settings mirrored the planned migration exactly: synthesis enabled, `text-embedding-3-large` pinned for the question, and the bands measured for that geometry (attach 0.86, synthesis 0.80, cluster 0.75). The build fingerprint was identical before and after each run. The first replay took 68 minutes; the second, on the fixed build, about 95 minutes.

**Verification without ground truth.** A real question has no answer key, so we substituted independent blind judgement, with three instruments. Two of them come from a different model family than the pipeline's judge, which breaks the circularity of one model grading another.

- *Merge audit.* Two independent auditors, blind to the syntheses' titles and texts and to each other, judged every member of every synthesis against the group's core proposal under the pipeline's own rubric: "same" means interchangeable proposals, same topic is not same proposal, and doubt counts as a wrong merge. They were instructed to refute.
- *Missed-merge sweep.* Two independent sweepers read every un-merged statement and hunted for statements that duplicate an existing synthesis and for un-merged pairs that duplicate each other, under a strict rubric where doubt means no merge.
- *Text fidelity.* The programme's own scorer, `textFidelity.mjs`, self-tested before use, graded what each published synthesis text preserves of its members' asks: preserved, weakened or lost, plus any commitment the text makes that no member made.

Only findings on which both independent judges agreed are counted below. Single-judge findings are listed as contested in the audit files.

## 3. Before: what production had built

Production, running the older cosine-first pipeline, had organised the question into three themes and one synthesis. The theme "כלים מחקריים לשינוי סביבתי" held 59 statements in a flat list. The "synthesis" titled "ליצור פורום תקופתי לדיון והסכמות בין בעלי עניין" held 24 statements, of which only two actually proposed a periodic stakeholder forum; the other 22 ranged from multidisciplinary research to legal action against polluters. A third theme restated the question. Fourteen statements were unplaced, with no flag to say so. In the case study's words, the readable structure amounted to two usable groups.

## 4. First replay: the all-judged build

The replay produced eleven syntheses, two themes and 27 open statements. Table 1 shows the structure side by side with production; the full member listings, in Hebrew, are in the companion case study.

**Table 1. Structure before and after the first replay.**

| | Production (before) | All-judged replay |
|---|---|---|
| Syntheses (merged proposals) | 1, holding 24 statements | 11, holding 2–8 statements each (34 in total) |
| Largest grouping | 59-statement flat theme | 66-statement theme, organised internally by 12 syntheses |
| Themes | 3, one of them restating the question | 2, each with a description |
| Statements grouped | 100 of 114 | 87 of 114 |
| Left open | 14, silently | 27, deliberately, tracked in the review queue |

The eleven syntheses were, with member counts: appoint a committed leading actor to connect academic knowledge with practice in the field (8); give suitable, targeted financial incentives and support (4); base research questions on deep understanding of the field (4); set up a matchmaking mechanism between researchers, civil society and ministries (4); and seven two-member syntheses covering a periodic stakeholder forum, motivation and persistence, personal acquaintance at conferences, accessible language, a liaison between research and the field, regular webinars, and public participation in strategy.

The pipeline made 71 attaches, 22 spawns and 9 sweep merges, and queued 30 items for review.

## 5. What the blind audit found

**Precision: 22 of 34 members correctly merged (65%).** Both auditors independently refuted the same eleven members. Six of them sat in the eight-member "appoint a leading actor" synthesis, which had absorbed a fragment, a goal, a different intervention (include end users), and two statements about applied research that share the aim but not the mechanism. This is the snowballing mode the design documents describe: a synthesis whose abstracted title made its neighbours look like paraphrases, growing by a chain of pairwise links. Six of the eleven syntheses were clean.

**Recall: 21 missed groupings, 19 of them silent.** Both sweepers converged on the same eleven missed attaches and the same five missed spawn pairs. Several misses were near-verbatim duplicates of existing members. Only two of the 21 statements were in the review queue; the other 19 had been filed under a theme or left unplaced with no flag. The sweepers also passed a restraint check: both independently rejected a tempting "science in government" cluster, three distinct mechanisms sharing one goal, which is evidence they applied the strict rubric rather than over-proposing.

**Fidelity: 0.647.** Of 34 member asks, 22 were preserved, 9 weakened and 3 lost, and two synthesis texts committed their supporters to machinery no member had asked for. All three lost voices were inside the same eight-member synthesis the auditors had condemned. Two model families and two instruments pointed at the same place.

Each failure traced to a mechanism rather than to bad luck. The merge sweep's judge saw only the first two members of each side, so a recipient that had already absorbed one merge presented a stale sample, and members drifted two hops apart. Nothing in the system ever re-examined a statement once a theme had filed it, so "topic membership is non-terminal" was a promise without a mechanism. And the writer, under merge pressure, generalised asks away and invented connective commitments.

One more finding matters for the platform's roadmap. This replay ran with the claim registry off, which is the default. The near-verbatim duplicates the sweepers found are exactly the semantic-recall gap the registry was built to close. This is the first real-data confirmation of that motivation.

## 6. The fix round

Three fixes followed, each one another application of the rule that geometry proposes and judgement disposes.

1. **A transitivity check on the merge sweep.** The closest cross-member pair may propose a merge, but the merged set is one proposal only if its two most distant members are themselves judged "same". The confirming judge now sees up to six members per side instead of two. Fail-closed, verdict-cached.
2. **A revisit pass.** The sweep restores candidacy for any un-synthesised statement whose evidence has come to clear the synthesis band, and sends it back through the full judged cascade. A fingerprint of the question's state ensures a stable corpus is not ground again.
3. **Two writer clauses.** Never add mechanisms, criteria or commitments that no input stated. Every input's specific ask must remain recognisable in the published text.

The same 114 statements were then replayed in the same order, and the same blind battery was run again.

## 7. Second replay: the fixed build

**Table 2. Before and after the fixes, same question, same arrival order, same blind instruments. Only findings agreed by both judges are counted.**

| Axis | First replay | Fixed build | What changed |
|---|---|---|---|
| Statements grouped into syntheses | 34 in 11 | 43 in 20 | more of the corpus organised |
| Largest synthesis | 8 members, 6 refuted | 4 members | snowball eliminated |
| Member-level merge precision | 22/34 (65%) | 32/43 (74%) | improved; error now confined to small pairs |
| Clean syntheses | 6 of 11 | 11 of 20 | |
| Sweep merges performed | 9 | 2 | merge gate conservative, as designed |
| Missed merges (attach + spawn) | 11 + 5, 19 of 21 silent | 12 + 3, none structurally silent | 9 were revisit-judged and refused; the rest awaited further sweep rounds |
| Text fidelity | 0.647; 3 lost, 9 weakened, 2 fabricated | 0.953; 0 lost, 2 weakened, 1 soft | fixed |
| Pipeline actions | 71 attach, 22 spawn, 9 merge, 30 review | 78 attach, 25 spawn, 2 merge, 50 revisit, 42 review | |

The fixed build produced twenty syntheses under three themes (personal factors for leading change, 5 statements; making research accessible and connecting it to the public, 39 statements and 16 syntheses; conditions for applying research, 5 statements and 3 syntheses). Eighteen of the twenty syntheses hold exactly two statements. The two larger ones are "strengthen applied research so that knowledge becomes change" (4) and "build committed partnerships with academic institutions, social organisations and businesses from the start" (3).

Each fix did what it was built to do. No synthesis exceeded four members, and the two merges the sweep did perform survived the transitivity check. Fifty revisit events fired, 36 statements got a second run through the full pipeline, and nine more statements ended up correctly grouped; several of the first replay's exact misses, the transdisciplinary pair, the citizen-science group and the accessible-language synthesis, now exist. Fidelity rose from 0.647 to 0.953, with zero lost voices, and the one surviving fabrication is soft: an elaborated benefit claim, not an invented mechanism.

## 8. What still fails, and where

The residual errors sit at two places, and neither is a gap in the architecture.

- **Precision now fails at the spawn writer, not the merge sweep.** All nine refuted merges are two-member pairs (plus one four-member synthesis with two refuted members) that entered when a new statement was paired with a neighbour and the writer's coherence check accepted a "related" Hebrew pair as "same", for example two different interventions that share a theme. Nine wrong pairs out of 25 spawns is the dominant precision residual.
- **Recall now fails at judge refusals and sweep budget.** Of the fifteen remaining agreed misses, nine were seen by the revisit pass and refused by the attach or spawn judge, on pairs the blind sweepers rate as high-confidence paraphrases. That is a genuine judge-disagreement band, and a targeted prompt experiment is the right next step. The other six simply needed more sweep rounds than the harness ran; production sweeps every ten minutes, the harness ran about four rounds.

Both residuals are the same lesson the hard-triplet work taught in another form. On real corpora the judge, not the geometry, is now the accuracy frontier, and it is measurable there only because everything else has stopped failing first.

## 9. What this changes

**For how we quote results.** The benchmark's 0.93 composite, precision 1.000 and fidelity 1.000 are properties of a clean corpus. The production expectation for a real Hebrew question, on present evidence, is member-level precision of about three quarters, a visible miss class of a few percent of the corpus that later sweeps keep working on, and fidelity above 0.95. The ICLR draft (`scientific-research/2026-09-04-iclr-paper/`) reports the 74%, not the benchmark number.

**For the platform.** The three fixes were deployed to production on 2026-08-25, together with the all-judged build, across all six synthesis functions. The one-call migration of this question to the new configuration (`reEmbedQuestion({questionId:'Bq-VQPMPiG7b', embeddingModel:'text-embedding-3-large'})`) has not been run as of the last record. The audit's remaining recommendations stand: enable the claim registry for real questions, where near-verbatim duplicates slip past geometry; run the fidelity scorer as a standard post-run gate, since it caught everything here; and run the prompt experiment on the spawn writer's coherence check for Hebrew pairs.

**For the method.** The verification pattern that worked, two blind adversarial auditors plus two missed-merge sweepers plus a fidelity scorer, with only cross-judge-agreed findings counted, took about fifteen minutes to run and found what a single-model evaluation could not. We recommend it as the standard check before any real question is migrated.

## 10. Caveats

The auditors are one vendor's models and the pipeline's judge is another's; cross-family disagreement is signal, not proof, but two blind judges agreeing on eleven of twelve refutations, corroborated by a third instrument on the worst synthesis, is far beyond chance. Seventeen statements hit the harness's 45-second settle cap in the first replay (three is typical for benchmark runs), so a few end-state placements may be harness artefacts. This is one question, replayed twice, on non-deterministic models; the numbers are indicative rather than calibrated. The attribution of the event to the Heschel Center comes from the platform operator's records and is not in the run artefacts, which identify the question only by its id and text.

## Provenance

- First replay: `runs/bq-replay-alljudged/` (results, audit log, `verification/VERIFICATION.md`, judge inputs and outputs `bq-synths.json`, `bq-nonmerged.json`, `audit-A/B.json`, `sweep-A/B.json`); build `3cb13d1d…`, git `8b4f1f9ad`.
- Fixed replay: `runs/bq-replay-fixed/` (same layout, `fixed-*.json`); fixes committed at `324bd8306` and the following fix commits.
- Fidelity verdicts: `scripts/.cache/text-fidelity-judge.jsonl`.
- Full before-and-after member listings: `REPORT-BqVQPMPiG7b-case-study.pdf` (2026-08-21).
- Summary in the series report: §9.3 of `reports-pdf/2026-08-24-geometry-proposes-judgement-disposes.pdf` (the repository copy; earlier exports of that report predate the addendum).
