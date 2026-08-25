# Prompt for Gemini — author an independent 100-statement benchmark corpus

Purpose: re-run the accuracy benchmark on a corpus authored by a **different model
family** than the one that wrote the original (and different from the pipeline's own
judges), removing generator bias from the measurement. Paste the block below into
Gemini verbatim. Save its output as
`scripts/seedSynthBenchmark.accuracy100.gemini.en.json`.

---

## The prompt (copy from here)

You are authoring a benchmark corpus for testing a civic-deliberation clustering
system. The system receives free-form citizen proposals one at a time and must decide,
for each pair, whether they are (a) the SAME proposal in different words, (b) DIFFERENT
proposals on the same theme, or (c) different themes entirely. Your corpus is the
ground truth it will be scored against, so the distinctions you author must be crisp.

Produce exactly this structure: **10 topics × 5 proposals per topic × 2 paraphrases
per proposal = 100 statements**, all answering one civic question:

**"What should our city do to improve residents' quality of life?"**

Rules, in order of importance:

1. **A paraphrase pair states the SAME specific action in genuinely different
   wording.** Same lever, same direction, same intervention, same scope — a supporter
   of one could not reasonably oppose the other. Vary sentence structure and
   vocabulary, not just one synonym; do not simply reorder the same words. Each
   statement is one sentence of roughly 8–20 words, written the way a real resident
   writes (plain, concrete, no bureaucratic boilerplate).

2. **The 5 proposals inside a topic are DISTINCT interventions on a shared theme.**
   This is the adversarial core of the benchmark: they must be close enough to tempt a
   clustering system (same domain, overlapping vocabulary is fine) while being actions
   a person could genuinely support one of and oppose another. "Run buses more often
   at peak hours" vs "add night buses on weekends" is the calibration example: same
   theme, two different service changes. Never make two proposals in a topic mere
   rewordings or magnitude variants of each other.

3. **The 10 topics are mutually distinct civic domains.** Choose your own 10 — do not
   ask me for a list. Any resident-relevant domains are fine (mobility, housing,
   safety, culture, environment, digital services, health, education, economy, public
   space, or others of your choosing).

4. **Make 8–10 of the 50 pairs "formulation-hard":** one statement names a category
   where the other names concrete instances of exactly that category ("traffic-calming
   measures near schools" vs "speed bumps and raised crossings near schools"). These
   are still the SAME proposal — that is the point.

5. **Never put a stance flip inside a pair.** "Ban X" and "allow X" are not
   paraphrases. Both statements of a pair must want the same thing.

Output **only valid JSON**, no markdown fences, no commentary, in exactly this shape:

```
{
  "questionId": "accuracy100gemini",
  "questionText": "What should our city do to improve residents' quality of life?",
  "language": "en",
  "design": "Gemini-authored accuracy corpus: 10 topics x 5 synth-groups x 2 near-paraphrases = 100 statements. Pairs are same-action rewordings; groups within a topic are distinct interventions; topics are distinct domains.",
  "topics": [
    {
      "name": "short-kebab-case-topic-name",
      "synths": [
        {
          "name": "short-kebab-case-proposal-name",
          "paraphrases": [
            "First wording of the proposal.",
            "Second, genuinely different wording of the same proposal."
          ]
        }
      ]
    }
  ]
}
```

Exactly 10 topics, exactly 5 synths per topic, exactly 2 paraphrases per synth. Unique
names throughout.

## (copy up to here)

---

## Optional second step — Hebrew twin corpus

After the English corpus is accepted, paste it back to Gemini with:

> Translate this benchmark corpus to Hebrew sentence-by-sentence. Keep the JSON
> structure, all `name` fields, and `questionId` suffixed `he` identical in structure;
> set `"language": "he"`, translate `questionText` and every paraphrase. Each Hebrew
> pair must remain a genuine same-action paraphrase pair in natural Hebrew — translate
> the meaning, not the word order.

Save as `scripts/seedSynthBenchmark.accuracy100.gemini.he.json`.

---

## Running it (unchanged harness)

```bash
# 1. geometry pre-flight — validates the corpus meets the cosine-band design
#    (within-pair ≥ ~0.85, cross-synth-same-topic 0.60–0.84, cross-topic < 0.60)
#    BEFORE spending any pipeline LLM calls. If Gemini's pairs are too loose or
#    its "distinct" proposals too close, this is where it shows.
npx tsx scripts/preflightCorpusCosines.ts scripts/seedSynthBenchmark.accuracy100.gemini.en.json

# 2. emulators (both required), then run + score
npm run deve
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/runAccuracyBenchmark.ts scripts/seedSynthBenchmark.accuracy100.gemini.en.json --seed=42
node scientific-research/2026-08-18-live-synth-accuracy/score100.mjs runs/<folder>
```

The harness's own structure validator enforces 10×5×2, so a malformed Gemini output
fails fast. Compare against the certified bands (EN 0.884–0.910 on the original
corpus) — but expect the number to differ for legitimate reasons: a differently-
authored corpus has different geometry, and the preflight report is what says whether
a gap is the pipeline's fault or the corpus being easier/harder.
