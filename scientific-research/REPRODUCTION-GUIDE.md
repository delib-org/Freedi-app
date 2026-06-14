# Reproducing the Synthesis & Clustering Validation — Scientist's Sheet

A self-contained, copy-paste guide for an **external scientist** to install the
Freedi app on their own machine and re-run the synthesis/clustering validation
**with their own set of sentences**.

This is the "how do I run it myself" sheet. Two companion docs go deeper:
- **`DESIGNING-TEST-CORPORA.md`** — how to design a corpus (archetypes, the cosine bands, gotchas).
- **`PREPARING-VALIDATION-REPORTS.md`** — the full agent protocol for recording a publishable run.
- **`validation/FINDINGS.md`** — the scientific summary of the runs already published here.

---

## 0. What you will actually prove

You build a corpus of sentences whose correct grouping you **already know** (the
"ground truth"), run it through the real pipeline, and a scorer measures how
close the pipeline's output is to your known answer.

The pipeline does two things:
1. **Synth** — merge sentences that say the *same thing* into one proposal.
2. **Topic-cluster** — group related-but-distinct synths under a shared subject.

A clean run recovers **T topic-clusters** and **T×S pure synths** with zero
overlap. That is what you reproduce.

---

## 1. Prerequisites

| Requirement | Version / note |
|---|---|
| **OS** | macOS or Linux (Windows via WSL2) |
| **Node.js** | **20+** (the published runs used 22.17.1; use that if you can) |
| **Git** | any recent |
| **Java** | JDK 11+ (the Firestore emulator is a JVM process) |
| **Firebase CLI** | `npm i -g firebase-tools` |
| **OpenAI API key** | **required** — generates the sentence embeddings (the clustering input). Get one at <https://platform.openai.com/api-keys>. Embeddings cost ~\$0.00002/1K tokens; a 40-sentence corpus is a fraction of a cent. |
| **Google Cloud project + Vertex AI** | **optional** — only needed for LLM-generated cluster *titles* and the `--two-tier` stance judge. Titles are non-deterministic and are **not** scored. Skip unless your test needs them. |

### Which AI keys you actually need

The pipeline calls **two different AI providers**, and you can run a full
structural validation with only the first:

| Provider | Used for | Env var | Required? |
|---|---|---|---|
| **OpenAI** | sentence **embeddings** — the vectors clustering runs on | `OPENAI_API_KEY` | **Yes.** Without it, options seed but never get embeddings, and clustering has nothing to run on. |
| **Google Vertex AI** (Gemini) | cluster **titles**, and the `--two-tier` opposite/near-dup **judge** | `gcloud` Application Default Credentials + a real GCP project with the Vertex AI API enabled | **No** for structure scoring. Titles aren't scored; only add this if you run `--two-tier` (stance/opposites). |

> The `env/.env.example` template has a `GEMINI_API_KEY` line — for the **local
> emulator** the title path uses **Vertex AI via `gcloud` ADC**, not that key, so
> leave it as a placeholder unless you've wired up your own Gemini path. The
> simplest correct setup is: **set `OPENAI_API_KEY`, skip Google entirely.**

---

## 2. Install the app

```bash
# 1. Clone
git clone <freedi-repo-url> Freedi-app
cd Freedi-app

# 2. Root deps
npm install

# 3. Build the shared types package (required before anything else builds)
cd packages/shared-types && npm run build && cd ../..

# 4. Functions deps (the validation scripts live here)
cd functions && npm install && cd ..
```

### 2a. Create your own environment file

This repo uses a **centralized** env system. You do **not** edit `functions/.env`
directly — it is **auto-generated**. The source of truth is `env/.env.dev`
(gitignored, so it does not exist on a fresh clone — you create it), and
`npm run env:dev` (which `npm run deve` runs for you) regenerates
`functions/.env`, `public/firebase-config.json`, and the per-app env files from
it on every start. **Hand-edits to `functions/.env` are overwritten.**

Create your dev env from the committed template:

```bash
cp env/.env.example env/.env.dev
```

Then edit `env/.env.dev` and set **the one key that matters** for validation:

```ini
OPENAI_API_KEY=sk-...your real key...
```

Everything else in the template can stay as placeholder values for emulator-only
validation: the seed/cluster/score scripts talk to the **emulator** via
`firebase-admin` using only `GCLOUD_PROJECT=freedi-test`, so the web Firebase
config (`FIREBASE_API_KEY`, `FIREBASE_APP_ID`, …) does not need to be real. Leave
`GEMINI_API_KEY` as-is (see the note above — local titles use Vertex/ADC).

Generate the app env files once to confirm it works (also done automatically by
`npm run deve`):

```bash
npm run env:dev      # reads env/.env.dev → writes functions/.env etc.
```

**(Optional) titles / `--two-tier` only** — authenticate Google ADC and point at
a real GCP project that has the Vertex AI API enabled:
```bash
gcloud auth application-default login
gcloud config set project <your-real-gcp-project-with-vertex>
# and run the emulator with that project instead of freedi-test if you want titles
```

---

## 3. Start the Firebase emulators

The validation runs entirely against **local emulators** — it never touches a
real database. In a dedicated terminal:

```bash
npm run deve
```

This starts Firestore (`:8081`), Functions (`:5001`), Auth (`:9099`), and
hosting locally. Leave it running.

> **If writes to `statements` fail with `2 UNKNOWN`**, the emulator JVM ran out
> of heap. Restart with more memory:
> ```bash
> JAVA_TOOL_OPTIONS="-Xmx4g" npm run deve
> ```

Every command below assumes these two env vars (the scripts refuse to run
without the emulator host, as a safety guard against hitting production):

```bash
export FIRESTORE_EMULATOR_HOST=localhost:8081
export GCLOUD_PROJECT=freedi-test
```

---

## 4. Write your own sentences (the corpus)

This is the only creative step. Create a JSON file — call it
`my-corpus.json` — anywhere in the repo. The shape:

```json
{
  "questionText": "How can we improve our neighborhood?",
  "design": "2 topics × 2 synths × 10 paraphrases = 40 options",
  "topics": [
    {
      "name": "green-space",
      "synths": [
        { "name": "plant-trees", "paraphrases": [
          "Plant shade trees along every street.",
          "Line the main roads with leafy trees.",
          "Add rows of trees on each sidewalk for shade.",
          "...10 total, each saying the SAME thing in DIFFERENT words..."
        ]},
        { "name": "build-parks", "paraphrases": [
          "Create a new public park downtown.",
          "Open a green park in the town center.",
          "...10 total..."
        ]}
      ]
    },
    {
      "name": "safety",
      "synths": [
        { "name": "more-lighting",   "paraphrases": [ "...10..." ] },
        { "name": "traffic-calming", "paraphrases": [ "...10..." ] }
      ]
    }
  ]
}
```

### The rules that make sentences land in the right group

The grouping is decided by **embedding cosine similarity**. To stay inside the
synth/cluster limits, target these bands (measured empirically in the published
tight run, `validation/4-6-2026-60-20-5-tight-validation/report.md`):

| Sentence pair | Target cosine | How to write it |
|---|---|---|
| **Same synth** (must merge) | **≥ 0.93** (≥ 0.94 merges with no LLM) | Identical meaning, **maximally varied wording** — vary verb, voice, length; no shared stock phrases. |
| **Different synth, same topic** (group, don't merge) | **~0.5–0.83** | Same subject, a genuinely **different action** ("plant trees" vs "build a park"), not a rephrasing. |
| **Different topic** (separate clusters) | **low** | Unrelated subjects. |

Hard structural limits baked into the pipeline — design around them:

- **A synth needs ≥ 3 members** in the bulk path (DBSCAN `minPts = max(3, ⌈N/200⌉)`).
  Use ≥ 5 paraphrases per synth to be safe. Fewer than 3 → it falls out as noise.
- **A topic-cluster forms only for a topic with ≥ 2 synths.**
- **Cosine alone merges opposites** ("increase X" / "decrease X" sit at high
  cosine). Splitting stance requires the LLM-judged path (`--two-tier`), not
  plain bulk clustering.
- A truly lone sentence (1 paraphrase) **stays unclustered** — that's correct,
  not a failure. Tag it `"role": "singleton"`.

You can use any counts (not fixed at 2×2×10). For richer designs — singletons,
opposites, noise, uneven sizes — read **`DESIGNING-TEST-CORPORA.md`** §3 (the
archetype catalog tells you which pipeline path each one needs).

> **Disclosure for any publication:** these are AI-authored synthetic sentences,
> cleaner than real deliberation. A PASS on synthetic data is *necessary, not
> sufficient*. Always state this as a threat to validity.

---

## 5. Create a question, then seed your sentences

1. Open the local app (the URL `npm run deve` prints, e.g. `http://localhost:5173`),
   sign in, create a new **question** statement, and copy its id from the URL
   (`/statement/<questionId>`). Or reuse any empty question id.

2. Seed your sentences as raw options (synthesis OFF; embeddings are generated by
   the standalone trigger). Run from `functions/`:

```bash
cd functions
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/cleanRawSeed.ts <questionId> ../my-corpus.json "How can we improve our neighborhood?"
```

The script writes each sentence as an option, then waits until every option has
an embedding. (It's idempotent — re-running skips already-seeded options.)

---

## 6. Cluster + find the right granularity (ε sweep)

`ε` (DBSCAN epsilon, a cosine *distance*) sets granularity: smaller splits
same-topic synths apart, larger merges them. **Sweep it** to find the value that
recovers your ground truth — the sweep is itself a result you report, never a
silent knob you twist until it passes.

```bash
# PREVIEW (no writes) — sweep eps and watch which recovers your structure:
for eps in 0.6 0.8 1.0 1.3; do
  echo "=== eps=$eps ==="
  FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
    npx tsx scripts/bulkRebuild.ts <questionId> --eps=$eps --topic-threshold=0.45 \
    --ground-truth=../my-corpus.json
done
```

Pick the `eps` that yields your intended synth + topic counts with high purity,
then **execute** it (this writes the cluster docs):

```bash
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/bulkRebuild.ts <questionId> --eps=<chosen> --topic-threshold=0.45 \
  --execute --ground-truth=../my-corpus.json
```

> Add `--two-tier --max-llm-calls=2000` only if your test depends on the LLM
> verifier (splitting opposites, near-duplicate synths). It needs the Google/
> Vertex credentials from §2a.

---

## 7. Export the artifacts

Produce the four-file run folder a reviewer needs. Name it
`D-M-YYYY-<options>-<perTopic>-<perSynth>-validation`. The full export one-liner
(it pulls statements, embeddings, and results out of the emulator and writes the
ground-truth labels from your corpus) is in
**`PREPARING-VALIDATION-REPORTS.md` §4** — copy it, set `QID`, `DIR`, and point
the corpus path at `my-corpus.json`. It writes:

```
<run-folder>/
  statements.json   # your sentences + ground-truth labels
  embeddings.json   # the exact 1536-d vectors (so others reproduce without an API key)
  results.json      # the pipeline output + parameter manifest
```

---

## 8. Score and independently verify

```bash
# Level 1 — score the output against your ground truth (no deps, no keys, no emulator):
cd scientific-research/validation && node score.mjs <run-folder>

# Level 2 — re-derive the clustering from the shipped embeddings (no OpenAI, no emulator):
cd functions && npx tsx scripts/verifyFromEmbeddings.ts \
  ../scientific-research/validation/<run-folder> --eps=<chosen> --seed=42
```

`score.mjs` derives the expected structure from your labels and checks: synth
count, per-synth purity + exact size, the produced↔expected bijection, zero
overlap, full coverage, singletons-stay-out, and topic grouping. It prints an
`N/M checks passed` verdict.

`verifyFromEmbeddings.ts` re-runs the clustering primitive on the exact vectors
with the fixed UMAP seed (42) — membership must reproduce identically. This is
how a third party confirms your numbers **without any API key**.

---

## 9. Reading the result

- **PASS** = pipeline output matches your ground truth at the chosen `ε`.
- **Partial/FAIL** is also a valid scientific result — it usually means your
  corpus stressed a real boundary (e.g. within-synth cosine fell below 0.94 so
  members got fragmented, or opposites merged on the cosine-only path). Report
  *why*, with the cosine distribution, rather than tuning until it's green.
- **Determinism scope:** cluster *membership* is deterministic given the
  embeddings (UMAP seed 42). Cluster *titles* are LLM-generated and are **not**
  deterministic — never score on titles. Embeddings can also drift if OpenAI
  updates `text-embedding-3-small`, which is exactly why `embeddings.json` is
  shipped.

To write this up as a publishable run, follow `PREPARING-VALIDATION-REPORTS.md`
§7 (report template) and §11 (pre-commit checklist).

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| My `OPENAI_API_KEY` edit in `functions/.env` vanished | Expected — `functions/.env` is auto-generated. Put the key in `env/.env.dev` and re-run `npm run env:dev` (§2a). |
| `npm run env:dev` errors / no `env/.env.dev` | You didn't create it. `cp env/.env.example env/.env.dev` first (§2a). |
| `Refusing to run without FIRESTORE_EMULATOR_HOST` | Export the two env vars from §3. |
| Writes fail with `2 UNKNOWN` | Emulator OOM — restart with `JAVA_TOOL_OPTIONS="-Xmx4g" npm run deve`. |
| Options seeded but no embeddings | Check `OPENAI_API_KEY` in `functions/.env`; watch the Functions emulator log for the embedding trigger. |
| A synth came out as "noise" | It had < 3 members — give each synth ≥ 3 (ideally ≥ 5) paraphrases. |
| Opposites merged into one synth | Expected on the cosine-only bulk path; add `--two-tier` (needs Vertex creds). |
| Same-topic synths merged into one | `ε` too large — lower it and re-sweep. |
| Distinct synths split across topics | `ε` too small, or your paraphrases are too lexically varied (cosine < 0.93) — tighten wording. |

---

## License

Part of the Freedi project — **GPL-3.0** (`LICENSE.md` at the repo root). These
validation artifacts and scripts are released under the same license.
```