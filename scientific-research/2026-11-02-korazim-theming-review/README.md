# Why the facilitator had to re-cut the Korazim themes (2 November 2026)

**Question.** Sigal Gilboa, an experienced participatory facilitator, edited the AI theming of the two Korazim Stage A questions for the community report (`IqKVla0ZHw-m` "what to preserve", Q.A; `WfkDISMmbduQ` "what to improve", Q.B). She said two things:

1. The clustering divided a few main clusters into small ones, apparently without a reason.
2. The themes don't come from the participants' semantic fields.

**Answer.**

- **Criticism 1 is confirmed as a description of the machinery.** Nearly every theme came out of the size-triggered split sweep, the splitter never declined, and the fixed rule would split three of her own umbrella topics again. Content played no part in deciding *whether* to split. What is not shown is that splitting alone explains her merges: most pairs she merged were never split siblings.
- **Criticism 2 is confirmed for vocabulary, on her own definition.** By "semantic field" she means the professional vocabulary of community development and facilitation, such as "בינוי קהילה" and "חוסן קהילתי"; the AI used simpler terms. "בינוי קהילה" appears in no theme label, and "חוסן" in one final label, inside a list. The same model produces much of this vocabulary when asked to, so this looks like a prompt gap rather than a model limit. Asking for it did not reproduce her groupings, though.

**Scope.** Diagnosis only. No pipeline code changed. One facilitator, two questions, five merge decisions, and hypotheses formed after seeing her edits. Treat this as a detailed case study.

## The record

| | Q.A | Q.B |
|---|---|---|
| Originals / syntheses / atoms | 187 / 32 / 113 | 232 / 38 / 166 |
| System themes | 16 | 27 |
| Topics in her report | 12 | 20 |
| Themes grouped under one umbrella | 4 into "חזות הישוב"; 3 into "תרבות קהילתית" | 6 into "בינוי קהילה"; 3 into "שיח ציבורי"; 2 into "שיפור פני הכפר" |
| Themes split apart | "סיוע הדדי, התנדבות וחוסן" | "טבע, מורשת ואיכות הסביבה" |

Of the 26 comments in the log, 13 merge, 2 split and 5 move single statements. The direction is overwhelmingly coarser.

## Finding 1: where the themes came from

The export doesn't hold lineage, so it was pulled read-only from prod.

| | Q.A | Q.B |
|---|---|---|
| Theme docs ever created | 46 | 42 |
| Born from a split | 42 | 38 |
| Final themes born from a split | 15 of 16 | 27 of 27 |
| Splits / theme merges | 12 / 18 | 9 / 6 |
| Deepest split chain of a final theme | 4 | 3 |
| Re-theme ("Rebuild") events or proposals | 0 | 0 |

- **"Re-theme with AI" never ran on these questions.** Its rules (15-theme ceiling, its prompts) didn't shape what she saw. The live pipeline did.
- **Splitting is not the whole story.** Merges also moved material: on average only 63% (A) and 67% (B) of a split-born final theme's members were there at the split. "Born from a split" describes the document, not all of its contents.
- **Cross-domain merges happened.** A theme born "ערבות הדדית וחוסן קהילתי" absorbed gardening themes, was retitled "גינון ונוי במרחב היישוב", and was later split into mutual aid and gardening again.

## Finding 2: splitting answers size, not content

`splitOversizedThemes` fires at ≥8 leaves and either ≥⅓ of what is placed or ≥25 leaves outright. The prompt opens with "It has grown too large to browse" and permits an empty answer if the proposals form one coherent sub-area.

- **The splitter never declined.** Prod logs for the last 30 days show 21 splits, all on these two questions, and no `noSplit` verdict on any question. With 21 of 21 the 95% lower bound on its split rate is about 87%.
- **The 25-leaf rule doesn't scale.** It equals 16% of Q.A's placed leaves and 12% of Q.B's. The ⅓ rule explains early splits; on a large question the fixed rule takes over.
- **Her topics couldn't survive.** By the code's own count "חזות הישוב" (47 leaves), "תרבות קהילתית" (32) and "בינוי קהילה" (43) exceed 25, so the sweep would treat them as oversized. None passes the ⅓ rule. "שיח ציבורי" and "שיפור פני הכפר" (14 each) wouldn't trip it, so size reaches 3 of her 5 merges.
- **Calibration history.** The trigger was built for Bq-VQPMPiG7b, a narrow question where one theme really was a catch-all (61 of 114 statements). Here a large "community" theme may be the real centre of what residents said. Size can't tell these apart.
- **The system can't undo a split.** `containsSplitSiblings` makes the merge sweep refuse sibling groups. This fired 293 times (115 + 178) across 55 distinct groups.

## Finding 3: how far splits explain her merges

| Pairs of final themes | Q.A | Q.B |
|---|---|---|
| She merged: split siblings | 4 of 9 | 6 of 19 |
| She kept apart: split siblings | 11 of 111 | 33 of 332 |
| One-sided Fisher p | .014 | .012 |
| She merged: merge judge had tried (refused) | 3 of 9 | 6 of 19 |
| She kept apart: judge had tried (refused) | 5 of 111 | 22 of 332 |

Read these with care:

- **Most pairs she merged are not siblings** (5 of 9, 13 of 19). "בינוי קהילה" spans several split events.
- **Enrichment is partly built in.** Siblings are similar by construction, and the guard protects them while the sweep removes other near-duplicates. No donor in the 24 merges went into its direct sibling.
- **The refusal signal isn't independent.** Inside sibling pairs alone, merged × refused isn't significant (p = .14, .36). A whole group is refused if any two members are siblings, so 2 and 8 non-sibling pairs count collaterally.
- **The p-values overstate the evidence.** The real unit is 5 merge groups, not 28 pairs.
- **Removing the guard wouldn't reproduce her structure.** Most pairs the judge tried are ones she kept apart (27 of 36).
- **Undoing splits doesn't either.** Reversing the latest splits helps Q.A only at one cut chosen in hindsight (ARI .66 at 9 themes) and never helps Q.B.

The precision against her partition is high (.91 and .985) and recall is lower (.41 and .65): themes are mostly clean subsets, and she wants coarser ones. Since she edited the system's list, this shows direction, not quality. A *random* coarsening of the live list with her group sizes scores ARI .64 and .62 against itself, so these agreement numbers are largely structural.

## Finding 4: professional vocabulary (her definition)

**Definition, from Sigal via Tal after the first version of this study:** a semantic field is the vocabulary professionals use in community development and facilitation. The first version assumed it meant residents' own vocabulary, so the tests in Finding 4b answer a different question from the one she raised.

Statements or labels matching each term. Terms are her two examples plus close neighbours chosen by the analyst, not a vetted list.

| Term | Final labels (43) | All theme docs ever (88) | Synthesis titles (70) | Originals in AI form (321) | Plain originals (98) |
|---|---|---|---|---|---|
| בינוי קהילה | 0 | 0 | 0 | 0 | 0 |
| חוסן (any) | 1 | 1 | 0 | 1 | 0 |
| לכידות (any) | 0 | 1 | 1 | 2 | 1 |
| הון חברתי | 0 | 0 | 0 | 0 | 0 |
| פיתוח קהילתי | 0 | 0 | 0 | 0 | 0 |

- **The criticism holds.** These terms are nearly absent from every layer, and she couldn't have got them from the data: residents barely use them either. They are knowledge a professional brings to the material.
- **No prompt invites them.** The label prompt's examples are "Public transit improvements" and "Park & green space", and it asks for the "lever, mechanism, actor, or domain".
- **The model knows the vocabulary.** With a professional framing (Arm P, Finding 5), and none of her terms in the prompt, it wrote "חוסן קהילתי", "לכידות קהילתית", "תרבות קהילתית" and "הון חברתי" unprompted. It never wrote "בינוי קהילה" in 6 runs, and whether its other terms ("ממשל קהילתי", "קיימות סביבתית") are good professional usage needs her judgement.
- **Not all her names are of this kind.** "חזות הישוב" and "שיפור פני הכפר" look local rather than professional.
- **An open design question.** Labels are read by residents as well as by professionals, and a participatory process may want residents' language on some screens. The report and the resident-facing screens may need different names.

## Finding 4b: residents' language and the labels (not what she meant)

These tests assumed the first version's reading. They stand as facts about provenance, not as a test of her criticism.

**What is established**

| | Q.A | Q.B |
|---|---|---|
| Originals in the AI's `Title: body` form | 140 of 187 | 181 of 232 |
| AI-written share of direct theme members | 87% | 85% |
| Plain resident-form originals | 47 | 51 |

- MC's splitter writes `${title}: ${description}` (`fn_prepareSuggestion.ts`, `AddSolutionFlow.tsx`), so most "originals" are AI rewrites before clustering starts. Residents can edit these in the preview, so some wording may be theirs.
- Language passes through as many as three AI layers: rewrite → synthesis → label. A new theme's label comes from one synthesis (`generateTopicLabel([synthDoc], ...)`), split labels from member titles.
- Mean retention of plain originals' content words in their synthesis title is 56%.
- Every prompt asks for a "domain, lever, mechanism or actor" with examples like funding and data access. No prompt asks for residents' words. Labels must be 3–6 words (`requestTopicLabel`), which excludes 5 of the 7 names she coined.
- Benchmarks don't measure this. `score100.mjs` carries titles, but its composite is `0.6·F1_synth + 0.4·F1_topic`, membership only.

**What was tested and did not separate her from the system**

| Test | System labels | Her new names | Note |
|---|---|---|---|
| Content words attested in plain text, A | .43 | .57 | Not distinguishable |
| Content words attested in plain text, B | .42 | .48 | Not distinguishable |
| Whole label verbatim in originals | 0 of 16; 0 of 27 | "שיח ציבורי" 2, "שיפור פני הכפר" 1, "תרבות קהילתית" 1 variant, others 0 | Too few to compare |
| Register (hand-coded, single rater, not blind): everyday | 6 of 16; 8 of 27 | 2 of 7; 2 of 7 | Goes against the hypothesis |

- **The attestation metric is weak.** The prompt-driven Arm F (below) matches or beats her on it, so it doesn't identify expertise. The Hebrew matcher is heuristic: it strips prefixes and suffixes, has false matches (הכנסת~להכנסות) and misses roots (ניהול/לנהל).
- **Her names have mixed origins.** A reviewer found variants of "חזות", "שיפור פני הכפר" and "שיח ציבורי" in residents' text, and the report itself mentions "צוות שיפור פני הכפר" and "ועדת חזות", so these look like local institutional terms. "בינוי קהילה" and "לכידות קהילתית" don't appear as phrases, which suggests professional vocabulary. Both are hypotheses for her to confirm.
- **Compound labels: a difference, with limits.** System labels are almost all lists (15 of 16; 26 of 27). The 7 umbrella names picked by hand aren't. But her final topic list is still 7 of 12 and 16 of 20 compound, because she kept many labels as they were (5 and 13 verbatim). Her splits and narrowing all fell on compound labels, a small but suggestive signal.
- **Field spread is inconclusive.** Against random merging, her topics concentrate residents' top terms in one of four tests (Q.A all originals, p = .027, uncorrected). Term lists remain noisy.
- **Embeddings are inconclusive.** AUC for her merged pairs vs. not depends on the method (Q.A .52 or .72, Q.B .39 or .50). Centroid cosine correlates with theme size (.57, .66). Neither "embeddings can" nor "can't" find her merges is supported.

## Finding 5: counterfactual replay (hypothesis-generating)

Three repeats per arm through the compiled production rebuild, no prod writes, total cost about $0.86.

- **Arm R:** shipped prompts.
- **Arm F:** the same mechanics with a facilitator framing, written after seeing her result. It asks for "plain words residents or their village would use", the opposite of what she meant.
- **Arm P:** the same mechanics framed by the professional concepts of community development, added after her definition. None of her terms are in the prompt.

| Mean of 3 | R, Q.A | F, Q.A | P, Q.A | R, Q.B | F, Q.B | P, Q.B |
|---|---|---|---|---|---|---|
| Themes | 13.3 | 10 | 11.3 | 15 (ceiling, all runs) | 12.3 | 13 |
| Largest theme (atoms) | 15 | 20.7 | 17.3 | 25.3 | 34 | 29 |
| Compound names | 13.3 | 0 | 3.3 | 14 | 0.3 | 5 |
| Joins pairs she joined across live themes | 20% | 36% | 25% | 44% | 47% | 31% |
| Joins pairs she kept apart | 3% | 6% | 6% | 5% | 8% | 7% |
| Keeps pairs the live themes held together | 55% | 62% | 51% | 53% | 54% | 49% |

- **Re-theme as shipped wouldn't have given her structure.** It reduces the theme count, but on Q.B it hits the ceiling every time, names stay compound, and nearly half of the groupings she accepted dissolve.
- **The facilitator framing is not shown to be better.** The name shape changes because the prompt demands it, so that isn't evidence. It joins somewhat more of what she joined and also more of what she kept apart. Three repeats can't separate the arms, and its largest Q.B theme (34 atoms) may be a catch-all.
- **The professional framing changes the words, not the structure.** Arm P joins pairs she joined at a rate between R and F on Q.A (25%), and the lowest of the three on Q.B (31%). So "use the professional concept and the umbrella follows" isn't supported: asking for professional terms does not produce her "בינוי קהילה" grouping.
- **Do not compare these arms with the live list on ARI.** She edited the live list, so it wins by construction.

## What these data can't support

- That the split sweep caused the mismatch with her structure, rather than contributing to it.
- That the merge judge agreed with her.
- That her names are closer to residents' language or more everyday.
- That Arm P's terms are good professional usage, or that a professional prompt would satisfy her: no professional has rated them.
- That a facilitator prompt beats the shipped one, or that embeddings can or can't recover her merges.
- Any generalisation beyond this case, or precise significance claims: the tests are uncorrected and post hoc.

## Hypotheses

| | Claim | Status |
|---|---|---|
| H1 | Size-triggered splits caused the over-division | **Partly.** Mechanism confirmed, explains only part of her merges |
| H2 | Arrival-order growth and unrepaired fragmentation | **Partly.** Merges cross split events, but churn between merges and splits makes order hard to isolate |
| H3 | Labels drift from residents' words in an administrative register | **Not supported as measured, and not her criticism.** Provenance is established; the word-level effect isn't |
| H4 | Lever/actor framing cuts across residents' fields | **Unresolved, and not her criticism.** One of four noisy tests |
| H6 | Labels lack the profession's vocabulary (her definition, added after the first version) | **Supported on labels, for a small analyst-chosen term list.** A prompt supplies much of the vocabulary but not her groupings |
| H5 | Granularity depends on purpose | **Plausible, unmeasured.** Fanny's hand-coding of Bq had 36 clusters for 114 statements, about 3 per cluster; Sigal has 13 (A) and 11 (B) leaves per topic. Different questions and different purposes, so this is only suggestive |

## Limits

- **One rater, anchored.** She edited the system's list rather than coding blind.
- **Purpose.** Her merges were made for a community report, not for browsing or analysis.
- **Attribution.** The comment log is signed by Tal's account and the report is co-signed; the comments are treated as Sigal's, as Tal reported. Individual names may not all be hers.
- **Comment log.** It isn't in the docx, and it isn't stored here because it quotes contested items. Moves were checked against the report body.
- **S2 is an inference.** The issued partition is S1. S2 adds the open Q.A request (clusters 3 + 7), read as an older row order. Q.B's "ועוד" note can't be resolved.
- **"Plain" is an approximation.** It means not in AI form. It may include edited or noisy text.

## Proposals (none built)

1. **Ask Sigal to rate Arm P's names and to list her field's core terms (20 minutes),** and say which kept labels she accepted vs. left for lack of time. Her list would replace the analyst's term list above.
2. **Stop treating size as evidence of incoherence.** Scale or remove the 25-leaf rule, and make the splitter judge coherence first. Investigate why it never declines.
3. **Keep two levels.** The split tree already records a hierarchy, so a large topic with sub-headings could serve both a report and browsing. This would need an IA spec first.
4. **Offer a professional naming layer,** perhaps from a practitioner-vetted glossary and as an admin or report choice, and allow short names that aren't lists. Decide first which screens use which language.
5. **Add a label measure to the gate,** with human ratings, since membership F1 can't see this.
6. **Collect a blind coding** from a second facilitator on these two questions before tuning anything against this case.

**Side findings for a separate look:** 3 syntheses are filed under two live themes at once (1 in Q.A, 2 in Q.B). Refused sibling groups are re-asked many times (293 events, 55 groups), each a judge call.

## Corrections made by the audit

An independent reviewer recomputed the analysis from raw data before this was written. It overturned parts of the first version:

- The tier regex capped AI titles at 45 characters, putting 7 (A) and 20 (B) AI statements in "plain". Fixing it moved her Q.B attestation from .845 to .476 and removed the apparent advantage of her names.
- Doubly filed syntheses were placed by last write; they now use the report's placement.
- Hyphen variants were counted as new names, term choice depended on hash order, and the plain field test counted holders across all originals.
- Added: refusal test inside sibling pairs, leaf-centroid AUC, random-coarsening baseline, fair replay pair rates.

## Reproduce

Resident text, per-statement votes and the report **stay outside this public repo**. This folder holds AI labels, topic names, statement IDs, aggregates and scripts.

```bash
RAW=~/Downloads/korazim-theming-research
GCLOUD_PROJECT=wizcol-app node scripts/pull_lineage.cjs $RAW                    # read-only, .get() only
gcloud logging read 'jsonPayload.message:"group of split siblings refused"' \
  --project=wizcol-app --freshness=30d --limit=2000 --format=json > $RAW/refused-logs.json
bash scripts/run_replay.sh $RAW    # optional: real LLM calls, about $0.55
bash scripts/run_all.sh $RAW       # regenerates data/sigal_partition.json and results/metrics.json
```

Cloud Logging keeps 30 days, so the logs can't be re-pulled after that. Lineage data changes if the questions are re-themed. Every number above is in `results/metrics.json`, or comes from these log queries.

| File | Contents |
|---|---|
| `data/sigal_partition.json` | Theme → report topic (from the report's appendix), moves, report rater counts |
| `data/label_register.json` | Hand-coded register, single rater |
| `results/metrics.json` | All metrics |
| `scripts/pull_lineage.cjs` | Read-only prod pull |
| `scripts/build_partition.py`, `analyze.py`, `run_all.sh` | Partition and metrics |
| `scripts/replay.mjs`, `run_replay.sh` | Offline counterfactual |
