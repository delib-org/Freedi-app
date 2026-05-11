# Testing synthesis / clustering with real production data

The two scripts in this folder let you pull a single deliberation question
(plus all its descendants, evaluations, subscriptions, and cluster
artifacts) out of a real Firestore project and load it into the local
emulator so you can test the synthesis + reverse flow against realistic
data.

## What gets exported

For a given question id, the export bundles:

- The question doc itself
- Every descendant statement (walked via `topParentId` and a `parentId` BFS fallback)
- Every evaluation under any of those statements (`evaluations.parentId in [...]`)
- Subscriptions for the question
- Cluster aggregations and `clusterEvaluationLinks` belonging to clusters in the tree

## One-time setup

```bash
gcloud auth application-default login
```

You also need `tsx` available — it's a dev dep, so `npm install` once is enough.

## 1. Export from prod

```bash
GCLOUD_PROJECT=<prod-project-id> \
  npx tsx scripts/exportProdQuestion.ts \
    --question-id <statementId> \
    --out test-data/<descriptive-name>.json
```

**Safety**: the export script refuses to run if `FIRESTORE_EMULATOR_HOST` is
set, so you can't accidentally pull from your emulator.

The output is a single JSON file with metadata + every doc the local
emulator needs to reconstruct the question.

## 2. Start the emulator

In a separate terminal:

```bash
npm run deve
```

This starts hosting + firestore + auth + functions + storage on the
standard emulator ports (Firestore = `localhost:8081`, Auth = `localhost:9099`).

## 3. Import into the emulator

You'll want admin powers on the imported question so you can drive the
synthesis / reverse actions. Look up your local emulator user uid (sign in
once via the dev app, then check the Auth emulator UI), then:

```bash
FIRESTORE_EMULATOR_HOST=localhost:8081 \
  GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/importQuestionToEmulator.ts \
    --in test-data/<name>.json \
    --as-user <your-emulator-uid> \
    --as-display-name "Tal (admin)"
```

This:

- Writes every statement, evaluation, subscription, cluster aggregation, and `clusterEvaluationLink` into the emulator.
- Anonymizes user identifiers (uids, emails, display names) using a stable `sha256` hash so identical contributors collapse to a single anon id, but no PII reaches your dev machine.
- Remaps the question's creator to your uid AND injects an admin subscription for you on the question, so admin actions (synthesize, reverse, integrate) authorize.

### Optional flags

- `--keep-pii` — disable anonymization (use only with explicit consent from the data owner)
- `--skip-clusters` / `--skip-evaluations` — slim down the import for quick smoke tests
- The exporter has matching `--no-evaluations` / `--no-subscriptions` flags
- `--reparent-under <localStatementId>` — drop the imported options under an *existing* local statement instead of recreating the prod question. The script:
  - Skips writing the prod question doc.
  - Rewrites every imported `parentId` / `topParentId` that pointed at the prod question to point at your local target.
  - Rewrites evaluation `parentId` references the same way.
  - Skips importing prod subscriptions (your local question keeps its own).
  - Use this when you want to slot a real-world option pool into a local question you've already configured.

## 4. Verify and test

Open the dev app at `http://localhost:5173` (or whichever port the emulator hosting binds), navigate to:

```
/statement/<questionId>
```

You should see the imported question with its options, evaluations,
existing clusters, and any historical synthesis runs intact.

### Things to test for this feature

1. Open a question that has no synthesis yet → trigger synthesis from the admin clustering panel.
2. Verify the resulting cluster card shows:
   - "Synthesized" pipeline badge
   - The full source-idea list (clickable, with consensus chip per source)
   - Aggregated evaluation in the meta row
3. Click "Reverse synthesis" on a synthesized cluster → confirm dialog → cluster gets hidden, originals reappear.
4. Verify in the tree view that synthesized nodes show "Synthesized · N" badge and the inline source list.
5. Check the parent question's chosen options / consensus — synthesized cluster should appear in `results`, hidden originals should not.

## Cleanup

To wipe the emulator data and start over:

```bash
# Stop the emulator (Ctrl-C), then delete the persisted state if any
rm -rf .firebase-emulator-data    # path depends on your firebase.json import/export setup
```

Or restart `npm run deve` with no `--import` flag.

## Privacy reminder

Production data may contain personal information. The default anonymization
covers `uid`, `userId`, `evaluatorId`, `email`, `displayName`, and
`photoURL` on every doc that carries them. Statement text itself is **not**
modified — it's the deliberation content and we want to test against the
real strings. If your question contains user names or other PII inside
statement text, treat the JSON file as confidential and don't commit it.

`test-data/` is a good gitignored target; add it to `.gitignore` if it
isn't already.
