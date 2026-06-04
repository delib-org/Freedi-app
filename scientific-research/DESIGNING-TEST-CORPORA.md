# How to design a test corpus (agent protocol)

Companion to `PREPARING-VALIDATION-REPORTS.md`. That file says how to *run* and
*record* a validation; this file says how to *design the corpus* when the user
asks for a specific structure, e.g.:

> "Create 100 statements clustered into 5 topics, 4 synths per topic."
> "1 statement should not be in any big cluster — a singleton of its own."
> "Add a pair of opposites in one topic; they must not merge."

Your job is to turn a request like that into (a) a corpus JSON with a **known
ground truth**, (b) the right pipeline path to run it through, and (c) the
expected outcome the scorer will check.

---

## 1. The corpus spec (input format)

`cleanRawSeed.ts` accepts any shape of this form (no fixed 2×2×10):

```json
{
  "questionText": "How can we all be happy?",
  "design": "5 topics × 4 synths × 5 paraphrases = 100, + 1 singleton",
  "topics": [
    {
      "name": "physical-health",
      "synths": [
        { "name": "regular-exercise", "paraphrases": ["…", "…", "…"] },
        { "name": "cold-showers", "paraphrases": ["…"], "role": "singleton" }
      ]
    }
  ]
}
```

Rules the rest of the toolchain relies on:

- A synth's `paraphrases` are **semantically identical** restatements of ONE
  proposal, **lexically distinct** (different words/structure, no shared
  boilerplate). ≥ 2 paraphrases ⇒ the pipeline should merge them into one synth.
- The two+ synths inside a topic **share a subject but are different ideas**
  (e.g. "exercise" vs "eat well" — both health, distinct actions).
- Topics should be **cleanly separable** unless the test is specifically about
  topic confusion.
- Optional `"role"` on a synth marks intent: `"singleton"` (a lone idea that
  should stay unclustered), `"noise"` (off-topic; should not join any synth),
  `"opposite"` (same subject, opposing stance; must NOT merge with its sibling).

Keep the canonical corpus `scripts/seedSynthBenchmark.data.json` as the
reference example.

## 2. Translate the request → spec (recipe)

1. **Parse counts.** "N statements, T topics, S synths per topic" ⇒ paraphrases
   per synth `K = N / (T·S)` (must divide evenly; if not, tell the user and pick
   the nearest even split, recording it).
2. **Name** each topic and synth meaningfully (the names are the ground-truth
   labels used for scoring).
3. **Place special cases** the user asked for (singleton / opposite / noise) as
   extra synths/statements with the matching `role`.
4. **Author the sentences** (§4). Do NOT reuse phrasings across synths.
5. **State the expected outcome** explicitly in the report (§5).

Worked examples:
- *"100 → 5 topics × 4 synths"*: K = 100/(5·4) = 5 paraphrases per synth. Expect
  20 synths, 5 topic-clusters.
- *"…and 1 singleton not in a big cluster"*: add a 21st synth with `role:
  "singleton"` and a single distinctive statement (its own subject). Expect it
  to remain an **unclustered raw option** — see the gotcha in §3.
- *"…and a pair of opposites in topic 1"*: add a synth with `role: "opposite"`
  whose statement contradicts an existing one on the same subject. Expect them
  **not merged** — requires the LLM-judged path (§3).

## 3. Archetypes — what each validates, how to run it, and the gotchas

| # | Archetype | Encode as | Expected outcome | Run via |
|---|---|---|---|---|
| A | **Clean recovery** | T topics × S synths × K≥3 paraphrases | T topics, T·S pure synths, 0 overlap, 0 noise | **Bulk** (`bulkRebuild` / `verifyFromEmbeddings`) |
| B | **Uneven sizes** | synths with different K (each ≥3) | each synth recovered at its own size | Bulk |
| C | **Lone singleton** | a synth with `role:"singleton"`, 1 statement | stays an **unclustered raw option** (NOT a synth) | Bulk (then confirm it's unclustered) |
| D | **Small synth (2 members)** | a synth with exactly 2 paraphrases | a 2-member synth | **Live** path — see gotcha |
| E | **Opposites / stance** | a synth `role:"opposite"`, contradicting a sibling | **not merged** (separate groups) | **LLM-judged** path — see gotcha |
| F | **Distractor / noise** | statements `role:"noise"`, off-topic | unclustered / noise | Bulk |
| G | **Cross-topic near-duplicate wording** | two synths in different topics with similar surface words | each lands in its correct topic/synth | Bulk |

**Gotchas you must respect (these come from the implementation, not preference):**

- **Synths need ≥ 2 members.** A truly lone statement never becomes a "synth of
  its own" — synths *merge* duplicates. The correct expectation for a singleton
  is *"remains an unclustered option"* (it validates that the pipeline does not
  force it into a big cluster). If the user wants it to be its *own small synth*,
  give it ≥ 2 paraphrases (archetype D), not 1.
- **Bulk DBSCAN uses `minPts = max(3, ⌈N/200⌉)`** — so via the **bulk** path a
  group needs **≥ 3** members to form a cluster; 2-member synths and singletons
  come out as *noise/unclustered* in bulk. To validate 2-member synths
  (archetype D), run the **live** path (it spawns a synth from a pair), or lower
  `minPts` and document it.
- **`bulkRebuild.ts` clusters by cosine only — no negation/opposite judge.** It
  will **merge opposites** (they sit at high cosine). Archetype E therefore can
  only pass on a path that runs the LLM verifier: the **live** pipeline (Pass 3
  synth-vs-topic LLM judge), or the bulk pipeline's two-tier judge
  (`synthesizeIdeasExecute` with `SYNTHESIS_BULK_CLUSTER` + `SYNTHESIS_TWO_TIER_JUDGE`
  on). Do not claim a stance-splitting PASS from raw `bulkRebuild`.
- **Topic-clusters form only for topics with ≥ 2 synths.** A topic with one synth
  yields no topic-cluster.
- **`ε` sets granularity.** Smaller `ε` splits same-topic synths apart; larger
  `ε` merges them toward topic granularity. Always run the sweep (PREPARING §3b)
  and report which `ε` recovers the intended structure — the value is itself a
  finding, and it is corpus-dependent.

## 4. Sentence authoring rules

- Paraphrases of one synth: same meaning, **maximally varied wording** (no shared
  stock phrases, vary verb/voice/length). This is the realistic case and avoids
  trivially-high cosine from lexical overlap.
- Distinct synths in a topic: clearly different actions, not rephrasings.
- Opposites: identical subject, inverted stance ("increase X" / "decrease X").
- Keep one language per corpus unless multilingual robustness is the test.
- Disclose, always, that these are **AI-authored synthetic** sentences — they are
  cleaner than real deliberation (see PREPARING §0 and report §2.1).

## 5. Expected outcome & how it's scored

`score.mjs` derives the expected structure from the per-statement ground-truth
labels in `statements.json` — no hardcoding — using these conventions:

- `groundTruthSynth` label with **≥ 2** statements ⇒ one expected synth of that size.
- label with **1** statement, or any statement with `expectedRole` of
  `"singleton"`/`"noise"` ⇒ expected to stay **unclustered** (kept out of synths).
- a ground-truth **topic with ≥ 2 synths** ⇒ one expected topic-cluster.

So when you export `statements.json` (PREPARING §4), carry `groundTruthTopic`,
`groundTruthSynth`, and — for archetypes C/E/F — `expectedRole`, by extending the
text→label map to also return the corpus `role`. The scorer then checks counts,
per-synth purity + exact size, the produced↔expected bijection, zero overlap,
full coverage, singletons-stay-out, and topic grouping — for whatever structure
you defined.

## 6. End-to-end for a new design

1. Write the corpus JSON (this file) and save it (e.g. under a scratch path or as
   a new `scripts/seed-<name>.data.json`).
2. Seed + cluster + sweep + export + verify + write the report — follow
   `PREPARING-VALIDATION-REPORTS.md` exactly.
3. Score with `node validation/score.mjs <run-folder>` (now structure-agnostic).
4. In the report's §3.1, record the chosen `ε`, the sweep, and — for archetypes
   D/E — which non-bulk path you used and why.

Pick the **bulk** path for structure/size/topic recovery (deterministic, no LLM);
pick the **live or two-tier-judge** path when the test depends on the LLM verifier
(small synths, opposites, stance). State which path each run exercises.
