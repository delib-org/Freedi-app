# Per-Survey Backup & Restore

On-demand backup and restore for a single survey/question and every Firestore collection attached to it. Designed for targeted disaster recovery — e.g. an admin deletes a survey by mistake, a misbehaving Cloud Function corrupts evaluations, or you want a known-good snapshot before a risky migration.

This is **not** a whole-database backup. It covers one question tree (the question + all descendants + every doc that references them). Whole-project disaster recovery requires scheduled Firestore exports to GCS, which is out of scope for this iteration.

## What is included

Every document that is meaningfully tied to one question. Top-level collections:

- `statements` — the question and all descendants (options, sub-questions, paragraphs, clusters)
- `statementsSubscribe` — admin / member roles on the question
- `evaluations` — every evaluation of every option
- `votes`, `agrees`, `approval`, `importance` — the voting / agreement / importance / approval signals
- `choseBy`, `results` — chosen-option config and computed result aggregates
- `suggestions` — synthesized suggestions
- `userEvaluations` — per-user evaluation progress
- `polarizationIndex` — polarization aggregates
- `statementSnapshots` — historical snapshots of the question tree
- `userDemographicEvaluations` — demographic responses
- `surveyProgress` — per-user survey progress (MC)
- `moderationLogs`, `researchLogs` — audit / research trails
- `massConsensusProcesses`, `massConsensusMembers` — MC state
- `joinDelegates`, `joinDelegateInvitations` — Civil Activity Hub delegate state
- `statementsSettings`, `statementsMeta`, `statementsPasswords` — per-statement configuration
- `evidencePosts`, `evidenceVotes` — evidence / Popper-Hebbian collections
- `framings`, `framingRequests`, `framingSnapshots` — synthesis framings
- `clusterAggregations`, `clusterEvaluationLinks` — synthesis cluster state

Subcollections:

- `statements/{id}/statementHistory` — every statement's edit history
- `statements/{questionId}/joinFormSubmissions` — join-form submissions

## What is NOT included

- User account documents (`usersV2`, `usersData`, `usersSettings`) — those are global identities, not survey data.
- Notifications (`inAppNotifications`, `pushNotifications`, `emailNotifications`) — user-specific operational state.
- Analytics / engagement caches (`statementViews`, `statementSegments`, `creditLedger`, `userEngagement`, `engagementEvents`).
- Sign-app document versioning (`documentVersions`, `versionChanges`, `paragraphReplacementQueue`) — separate feature.
- Anything unrelated to the question (other surveys, global config, terms-of-use acceptance).

## One-time GCS bucket setup

Backups must NOT live in the git working tree. The default destination is a private GCS bucket in the production project. Create it once:

```bash
PROJECT=<prod-project-id>
BUCKET=gs://${PROJECT}-survey-backups

gsutil mb -p $PROJECT -l me-west1 -b on $BUCKET
gsutil versioning set on $BUCKET
gsutil uniformbucketlevelaccess set on $BUCKET

# Grant the operator(s). Anyone with this role can read or overwrite backups.
gsutil iam ch user:tal.yaron@gmail.com:roles/storage.objectAdmin $BUCKET
```

Optional but recommended: a lifecycle rule that expires non-current object versions after 365 days. Save as `lifecycle.json`:

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": { "daysSinceNoncurrentTime": 365, "isLive": false }
      }
    ]
  }
}
```

Then: `gsutil lifecycle set lifecycle.json $BUCKET`

### Migrate the existing local snapshot

The repo currently has `test-data/wizcol-e4Rvr.json` sitting in the working tree. Move it off-disk:

```bash
gsutil cp test-data/wizcol-e4Rvr.json gs://${PROJECT}-survey-backups/legacy/wizcol-e4Rvr.json
rm test-data/wizcol-e4Rvr.json
```

That file is an exportVersion=1 backup — it cannot be used to restore to production (the restore script rejects it). It is kept only as a reference for emulator-based development.

## Backup runbook

```bash
gcloud auth application-default login
GCLOUD_PROJECT=<prod-project-id> npm run backup:survey -- --question-id <statementId>
```

This uploads to `gs://<prod-project-id>-survey-backups/survey-<questionId>/<timestamp>.json` and prints per-collection counts.

Options:

- `--out gs://other-bucket/path.json` — custom GCS destination.
- `--out /absolute/path/outside/repo.json` — local file (must be absolute and outside this repo; relative paths and paths inside the working tree are rejected).
- `--bucket <name>` — override only the bucket name; keep the default `survey-<id>/<timestamp>.json` key.
- `--max-depth <n>` — limit the descendant BFS depth.
- `--no-evaluations` / `--no-subscriptions` — skip those collections (rare).

Verify after the export:

1. Look at the summary table. Are the counts non-zero where you expect data (evaluations, votes, etc.)?
2. Spot-check: `gsutil cat gs://<bucket>/survey-<id>/<ts>.json | jq '.meta.counts'`.

## Restore runbook

Restore is a two-stage process: dry-run first, then execute.

### Stage 1: dry-run

```bash
GCLOUD_PROJECT=<prod-project-id> I_UNDERSTAND_THIS_WRITES_TO_PROD=yes \
  npm run restore:survey -- \
    --in gs://<prod-project-id>-survey-backups/survey-<id>/<timestamp>.json
```

This reads the backup, scans the target project, and prints how many documents would be created vs. would overwrite existing docs. **Nothing is written.**

### Stage 2: execute

If the dry-run shows `overwrite=0` everywhere:

```bash
GCLOUD_PROJECT=<prod-project-id> I_UNDERSTAND_THIS_WRITES_TO_PROD=yes \
  npm run restore:survey -- --in gs://... --execute
```

If the dry-run shows any `overwrite > 0`, the restore will refuse `--execute` alone. You must additionally pass `--overwrite` to acknowledge that you intend to replace existing data:

```bash
GCLOUD_PROJECT=<prod-project-id> I_UNDERSTAND_THIS_WRITES_TO_PROD=yes \
  npm run restore:survey -- --in gs://... --execute --overwrite
```

After a successful execute the script writes `restore-receipt-<timestamp>.json` next to the input (same GCS prefix, or `--receipt-out <gs://...>` for a different location) listing what was created and what was overwritten.

### Safety checks

The restore script refuses to run unless:

1. `FIRESTORE_EMULATOR_HOST` is unset.
2. `GCLOUD_PROJECT` is set to the target project.
3. `I_UNDERSTAND_THIS_WRITES_TO_PROD=yes` is in the environment.
4. `--in` is a `gs://` URL or an absolute path outside the repo.
5. The backup is `exportVersion >= 2` (older backups are missing collections and would corrupt the restore).

### What restore preserves

- All original document IDs (so external references stay valid).
- Original timestamps and creator metadata.
- Evaluation aggregates on statements (`migratedAt` is stamped on evaluations so Cloud Function triggers skip re-aggregation — without this, re-aggregation would stampede and produce inconsistent counts).

### Post-restore verification

1. Open the app and navigate to the restored question (`/statement/<id>`).
2. Confirm: options visible, evaluation counts match the receipt, consensus values match, admin subscriptions intact.
3. If any computed aggregate looks off, trigger a manual re-aggregation by editing and re-saving one evaluation per affected option.

## Disaster scenarios this covers

| Scenario | Covered? |
|---|---|
| Single survey deleted by mistake | Yes |
| Evaluations corrupted on one survey | Yes |
| Need a known-good snapshot before a migration | Yes |
| Whole project lost (account deleted, region failure) | **No** — needs scheduled `gcloud firestore export` to GCS |
| Need to restore a single user's data across multiple surveys | No |
| Need to roll forward partial writes (point-in-time) | No — needs Firestore PITR |

## Operational notes

- The export script is read-only; it is safe to run on a live production project at any time. It does scan a lot of collections though, so prefer running it outside of peak traffic.
- The restore script writes in batches of 25 docs every 250 ms. A survey with ~50k docs will take roughly 8–10 minutes end-to-end.
- Restore writes statements first, then everything else, so listeners on the target project will briefly see statements with no evaluations attached. Plan downtime if this matters.
