# How to prepare a validation report (agent protocol)

Instructions for a Claude/agent session asked to validate the synthesis &
clustering pipeline and record it under `scientific-research/validation/`.
Follow this end to end. The goal is a record another scientist can **replicate
and falsify** from the repo alone.

---

## 0. Principles (non-negotiable)

1. **Use real data, never fabricate results.** Every number in a report must be
   read from the emulator or recomputed from committed artifacts. If you didn't
   run it, don't report it.
2. **Disclose the corpus origin.** Our benchmark sentences are *LLM-authored
   synthetic paraphrases*, not real participant data. Say so, every time, as a
   threat to validity. A PASS on synthetic data is *necessary, not sufficient*.
3. **Disclose every tuned parameter.** If you deviate from a production default
   (e.g. DBSCAN `ε`), show the sweep that justifies it and call it a
   parameter-sensitivity finding — never a silent adjustment to make the test
   pass.
4. **State the determinism scope.** Cluster *membership* is deterministic given
   embeddings (UMAP seed 42); *titles* are LLM-generated and are not. Embeddings
   depend on `text-embedding-3-small` and can drift across model versions — which
   is why we ship the input vectors.
5. **Record provenance.** Git branch + commit, tool versions, and the data's
   `createdAt`. A reader must know exactly what produced the data.

---

## 1. Prerequisites

- Firebase emulators running: `npm run deve` (Firestore `:8081`, Functions `:5001`).
- `cd functions && npm install`; `packages/shared-types` built.
- `functions/.env` has `OPENAI_API_KEY` (embeddings) + Gemini/Google credentials
  (titles). Without these the end-to-end run can't generate embeddings or titles.
- `GCLOUD_PROJECT=freedi-test`, `FIRESTORE_EMULATOR_HOST=localhost:8081`.
- Confirm the emulator is healthy before a long run (a triggered write to
  `statements` must succeed — the Firestore emulator JVM has OOM'd before; if
  writes to `statements` fail with `2 UNKNOWN`, restart with a bigger heap:
  `JAVA_TOOL_OPTIONS="-Xmx4g" npm run deve`).

## 2. Pick the corpus and question

- **Ground-truth corpus:** `scripts/seedSynthBenchmark.data.json`
  (`2 topics × 2 synths × 10 paraphrases = 40 options`). To design a *different*
  structure (other counts, singletons, opposites, noise, uneven sizes), follow
  **`DESIGNING-TEST-CORPORA.md`** — it defines the spec format, the
  request→corpus recipe, the archetype catalog (and which pipeline path each
  needs), and the scoring conventions. `cleanRawSeed.ts` and `score.mjs` are
  shape-agnostic, so any structure there is runnable and scorable.
- **Question:** create a fresh question in the app (note its id + text), or reuse
  an empty one. One validation = one question.

## 3. Run the validation (bulk path — the clean, disjoint one)

Validate the **bulk UMAP→DBSCAN** path; it produces disjoint clusters by
construction. (The *live* path is intentionally rough and is a separate, harder
test — see §8.)

```bash
cd functions
# 3a. Seed raw options with live-synth OFF, wait for embeddings.
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/cleanRawSeed.ts <questionId> ../scripts/seedSynthBenchmark.data.json "<question text>"

# 3b. PREVIEW + threshold sweep. Find the eps that recovers the ground truth.
for eps in 0.6 0.8 1.0 1.3; do
  echo "eps=$eps"; FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
    npx tsx scripts/bulkRebuild.ts <questionId> --eps=$eps --topic-threshold=0.45 \
    --ground-truth=../scripts/seedSynthBenchmark.data.json 2>&1 | grep -E "fine eps|cluster [0-9]|topic [0-9]"
done

# 3c. EXECUTE at the chosen eps (writes disjoint synth + topic-cluster docs).
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/bulkRebuild.ts <questionId> --eps=<chosen> --topic-threshold=0.45 \
  --execute --ground-truth=../scripts/seedSynthBenchmark.data.json
```

**Record the sweep** — it is the justification for the `eps` you pick, and a
result in its own right. Note which `eps` values recover the full ground-truth
structure and which over-merge.

## 4. Export the artifacts

Create the run folder and export from the emulator. Folder name:
`D-M-YYYY-<options>-<perTopic>-<perSynth>-validation`, where the date is the
data's `createdAt` (not "today").

Three files (run from repo root, replace `<QID>` and `<DIR>`):

```bash
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test node -e '
const {initializeApp}=require("firebase-admin/app");const {getFirestore}=require("firebase-admin/firestore");const fs=require("fs");
initializeApp({projectId:"freedi-test"});const db=getFirestore();
(async()=>{
const QID="<QID>", DIR="<DIR>"; fs.mkdirSync(DIR,{recursive:true});
const bm=JSON.parse(fs.readFileSync("scripts/seedSynthBenchmark.data.json","utf-8"));
const t2l=new Map(); for(const t of bm.topics)for(const s of t.synths)for(const p of s.paraphrases)t2l.set(p.trim(),{topic:t.name,synth:s.name});
const q=await db.collection("statements").doc(QID).get();
const c=await db.collection("statements").where("parentId","==",QID).get();
const byId={},raws=[],syn=[],top=[],emb={};
c.forEach(d=>{const x=d.data();byId[x.statementId]=x;});
c.forEach(d=>{const x=d.data();
 if(x.derivedByPipeline==="synthesis"&&!x.hide)syn.push(x);
 else if(x.derivedByPipeline==="topic-cluster"&&!x.hide)top.push(x);
 else if(x.statementType==="option"&&!x.derivedByPipeline){raws.push(x); const e=Array.isArray(x.embedding)?x.embedding:null; if(e)emb[x.statementId]=e;}});
const txt=id=>byId[id]?byId[id].statement:null;
const dates=[...raws,...syn,...top].map(s=>s.createdAt).filter(Boolean);
const runDate=new Date(Math.min(...dates)).toISOString();
fs.writeFileSync(DIR+"/statements.json",JSON.stringify({test:DIR.split("/").pop(),question:{id:QID,text:q.data().statement},groundTruthStructure:"2 topics x 2 synths x 10 paraphrases = 40 options",runDate,statementCount:raws.length,statements:raws.map(r=>({id:r.statementId,text:r.statement,groundTruthTopic:t2l.get((r.statement||"").trim())?.topic||null,groundTruthSynth:t2l.get((r.statement||"").trim())?.synth||null}))},null,2));
fs.writeFileSync(DIR+"/embeddings.json",JSON.stringify({test:DIR.split("/").pop(),description:"Exact input vectors so clustering replicates without the embedding API.",model:"text-embedding-3-small",dimensions:1536,contextFormat:"Question: ${q}\\nAnswer: ${t}",count:Object.keys(emb).length,embeddings:emb},null,2));
fs.writeFileSync(DIR+"/results.json",JSON.stringify({test:DIR.split("/").pop(),description:"Pipeline output, divided into synths and topic-clusters.",parameters:{embeddingModel:"text-embedding-3-small",embeddingDimensions:1536,clustering:"UMAP->DBSCAN (bulkClusterByEmbedding)",umapComponents:5,umapSeed:42,umapMinItems:10,dbscanEps:"<chosen>",dbscanMinSamples:3,nearestCentroidThreshold:0.6,topicGrouping:"single-linkage agglomeration of synth centroids",topicThreshold:0.45,llmTitles:"Gemini — non-deterministic"},synths:{count:syn.length,items:syn.map(s=>({id:s.statementId,title:s.statement,description:s.description||"",memberCount:(s.integratedOptions||[]).length,members:(s.integratedOptions||[]).map(id=>({id,text:txt(id),groundTruthSynth:t2l.get((txt(id)||"").trim())?.synth||null}))}))},topicClusters:{count:top.length,items:top.map(t=>({id:t.statementId,title:t.statement,description:t.description||"",memberSynthIds:t.integratedOptions||[],memberSynthTitles:(t.integratedOptions||[]).map(id=>txt(id))}))}},null,2));
console.info("exported to",DIR,"runDate",runDate);
})().catch(e=>console.error("ERR",e.message));
'
```

(After export, set `parameters.dbscanEps` in `results.json` to the actual chosen value.)

## 5. Verify (both levels)

```bash
# Level 1 — verify the verdict from artifacts (no deps/keys/emulator):
cd scientific-research/validation && node score.mjs <run-folder>

# Level 2 — re-derive clustering from shipped embeddings (no OpenAI/emulator):
cd functions && npx tsx scripts/verifyFromEmbeddings.ts ../scientific-research/validation/<run-folder>
```

Both must pass before you write PASS in the report. If they disagree with what
you intend to claim, the claim is wrong — fix the report, not the score.

## 6. Capture provenance

```bash
git rev-parse --abbrev-ref HEAD          # branch
git rev-parse HEAD                        # commit (record full + short)
node -v                                   # Node
node -e "console.log(require('./functions/node_modules/umap-js/package.json').version)"  # umap-js
ls ~/.cache/firebase/emulators/ | grep firestore   # emulator jar version
```

## 7. Write `report.md` (use this section template)

```
# Validation Report — Synthesis & Clustering
  header: Test ID, Date (= data createdAt), System, Question under test
  ### Provenance        — branch, full commit, commit subject, generated-by scripts, determinism note
## 1. Objective
## 2. Dataset             — the ground-truth structure table
  ### 2.1 Corpus construction & provenance — LLM-authored, synthetic; threat to validity
## 3. Procedure           — the exact steps run
  ### 3.1 Parameters & justification — full table (value | default | rationale) + the eps sweep
## 4. Results             — metrics table: expected | observed | pass
## 5. Verdict             — PASS/FAIL, one paragraph
## 6. Environment & versions — Node, umap-js, emulator, model, OS
## 7. Determinism & reproducibility scope — what reproduces, what doesn't, embedding-version caveat
## 8. Notes & scope       — bulk vs live; no votes seeded ⇒ structure-only; emulator caveat
## 9. Reproduction        — the three levels (score.mjs / verifyFromEmbeddings / full e2e + prerequisites incl. API keys)
## 10. License            — GPL-3.0 (repo LICENSE.md)
```

Copy an existing run's `report.md` (e.g. `1-6-2026-40-20-10-validation`) as the
template and edit the numbers — do not invent a new structure each time.

## 8. Optional: the live-pipeline (negative/robustness) test

The live incremental path does **not** cleanly recover the structure on its own
(spawn-debounce fragmentation, low-cosine topic spawns, and — before
`feb6987fd` — cross-cluster double-claims). Documenting a live run is valuable as
a *contrast*, but: (a) seed via `seedSynthBenchmark.ts` (synthesis ON, ~10 min),
(b) do **not** re-drain the queue as a cleanup (it is not a cleanup tool), and
(c) frame the result as "live path before scheduled consolidation," not a PASS.

## 9. Folder & naming

```
scientific-research/
  PREPARING-VALIDATION-REPORTS.md   ← this file
  scripts/                          ← seed script + corpus, as symlinks (README.md)
    cleanRawSeed.ts                 → ../../functions/scripts/cleanRawSeed.ts
    seedSynthBenchmark.data.json    → ../../scripts/seedSynthBenchmark.data.json
  validation/
    README.md                       ← protocol + run index (update it)
    score.mjs                       ← shared scorer (no deps)
    <D-M-YYYY>-<N>-<perTopic>-<perSynth>-validation/
      statements.json  embeddings.json  results.json  report.md
```

The canonical scripts live in the repo (`functions/scripts/`, `scripts/`);
`scientific-research/scripts/` surfaces the seed script + corpus as **symlinks**
to them (single source of truth, no duplication, no drift). Exact per-run content
is pinned by the commit in each run's `report.md`.

## 10. Commit

- Branch off `main` if you're on it; otherwise commit on the working branch.
- One commit for the validation run: `docs(validation): add <run-folder> …`.
- Update `validation/README.md`'s run index.
- Do **not** commit throwaway scratch files (e.g. ad-hoc seed-data copies).

## 11. Pre-commit checklist

- [ ] `score.mjs <run>` → PASS
- [ ] `verifyFromEmbeddings.ts <run>` → REPRODUCED
- [ ] `statements.json`, `embeddings.json`, `results.json`, `report.md` present
- [ ] report records branch + commit, versions, and the data's `createdAt`
- [ ] corpus disclosed as LLM-authored/synthetic (threat to validity)
- [ ] every tuned parameter justified with its sweep; deviations from defaults flagged
- [ ] determinism scope stated (structure vs titles; embedding-version caveat)
- [ ] no fabricated numbers — all read from emulator or recomputed from artifacts
