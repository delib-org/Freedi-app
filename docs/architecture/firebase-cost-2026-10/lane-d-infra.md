# Lane D - Background infrastructure audit (task t6)

Date: 2026-10-20. Branch: `feat/firebase-cost-infra`. Scope: `functions/` only.
All numbers below are **code-based estimates, not measurements**. Baselines quoted
from triage (production, 2026-10-20) are dated and were not re-measured. No money
estimates: no billing data was available.

## 1. Join: `serveJoinShareRoutes` scales to zero

Change: removed `minInstances: 1` from `functions/src/fn_joinShareRoutes.ts`
(commit "perf(join): serveJoinShareRoutes scales to zero"). This was the only
`minInstances` in `functions/src` (grep verified; `firebase.json:17` has a
`minInstances: 0` for another target, unchanged). Nothing else to list or recommend.

Does anything rely on warmness?
- The in-memory app-shell cache (`shellCache`, `SHELL_TTL_MS`) is an optimisation
  only. On a cold instance `getAppShell()` refetches `https://wizcol-join.web.app/index.html`
  (hardcoded canonical origin, bounded by `SHELL_FETCH_TIMEOUT_MS`). The failure path
  returns null and the handler falls back, as before.
- The 504 loop from 2026-07-30 (self-fetch through the rewrite) is unaffected: the
  origin is still hardcoded and `SHELL_REQUEST_MARK` still refuses re-entrant requests.
  A cold start cannot re-create it.
- Crawlers (WhatsApp, Telegram, Facebook) generally tolerate multi-second responses.
  The Hosting rewrite gateway timeout is 60s.
- `--force` is no longer needed to deploy this function (it was only required
  to raise the minimum bill).

Cold-start estimate (from imports, not measured): the file itself imports only
`firebase-functions/v2/https`, `firebase-admin/firestore` and `@freedi/shared-types`
(light). But the functions codebase is a single `index.ts` (~1,350 lines, ~230
exports, no lazy `import()`), and each Gen2 function's Cloud Run service loads the
whole module graph on cold start. So the real cold start is dominated by the
codebase's total import cost, not by this file: likely **1-3s**, plus the shell fetch
(~100-300ms). Tal accepted ~1-2s; the upper end may exceed that. Making the heavy
imports lazy inside `index.ts` is a codebase-wide change and was **not** done
(outside this lane). Measure after deploy (section 5).

Tradeoff: saves one always-on instance (idle billing) that saw no visible requests in
the inspected month; costs a slower first click on share links after idle (crawlers
unaffected in practice).
Rollback: re-add `minInstances: 1` and deploy with `--force`.

## 2. Scheduled jobs: audit table

22 `onSchedule` functions verified by grep (all present, all listed).
An empty query is billed as 1 read.

| # | Function | File | Schedule | Runs/day | What it reads each run | Bounded? | Usually finds nothing when quiet? | Latency need | Event-driven alternative reliable? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | processSynthesisQueue | synthesis/queue/processSynthesisQueue.ts | every 1 min | 1440 | 1 query `status==running`, limit QUESTIONS_PER_TICK; returns on empty | yes | yes | ~1 min (admin progress, queue drain) | Possible (Cloud Tasks) but changes queue semantics; not done |
| 2 | fn_clusterRecomputeFlush | synthesis/liveSynth/fn_clusterRecomputeFlush.ts | every 1 min | 1440 | 1 query on `_clusterRecomputeQueue`, limit 200; returns on empty | yes | yes (fills only when the polarization flag is on and votes land) | code documents 60s lag as acceptable | The debounce is the point of the queue; keep |
| 3 | fn_synthesisBulkFlush | synthesis/scheduled/fn_synthesisBulkFlush.ts | every 2 min | 720 | 1 query `_synthBulkRequests`, limit 50; returns on empty | yes | yes | QUIET_PERIOD 30s, so 2 min is already coarse | no |
| 4 | fn_synthesisHeartbeatSweep | synthesis/asyncJob/fn_synthesisHeartbeatSweep.ts | every 5 min | 288 | 1 query `lastHeartbeat < now-10min`, limit 50 | yes | yes | recovery backstop; stale age 10 min | no, it is the recovery mechanism |
| 5 | fn_synthesisReJudge | synthesis/scheduled/fn_synthesisReJudge.ts | every 10 min | 144 | 1-read probe (`lastUpdate > highWater`, limit 1) + 1 state doc; full sweep (up to 2,000 synth docs) only if something was written, forced every 6h (FORCE_FULL_SWEEP_MS) | yes | yes (gate already exists) | repair pass, minutes to hours | no |
| 6 | studioScheduledActionSweep | organizations/studio/scheduledActionSweep.ts | every 5 min | 288 | 2 queries (pending due, stale claims), limit 50 each = 2 reads when empty | yes | yes | facilitator open/freeze/close/reminder timing, minutes | Per-action Cloud Tasks would be exact but needs new infra; not done |
| 7 | updateDeliberations | deliberation/functions.ts | every 15 min | 96 | 1 query `dirty==true && lastCheckedAt<=now`, limit batchSize | yes | yes | "checked promptly" per code comment | trigger already marks `dirty`; scheduler is the debounce |
| 8 | fn_cleanupStaleEditingSessions | fn_cleanupStaleEditingSessions.ts | every 15 min | 96 | RTDB: whole `liveEditing/sessions` and `liveDrafts` subtrees (no Firestore reads) | no (RTDB bandwidth scales with live sessions) | yes | TTL 15 min | `onDisconnect` is primary; this is the crash backstop |
| 9 | evaluationDriftCorrection | fn_evaluationDriftCorrection.ts | every 60 min | 24 | 1 query: questions with `lastChildUpdate` in last 3h, limit 75; recomputes <=25 | yes | yes | hours; drift backstop | no, backstop |
| 10 | fn_handleVotingDeadline | fn_handleVotingDeadline.ts | hourly | 24 | 1 query: deadline mode + expired + not finalized, no limit (matches only due docs) | effectively | yes | an hour is the product granularity | no |
| 11 | agoraSessionSweep | agora/fn_agoraSessionSweep.ts | hourly | 24 | 1 query: open/live sessions ended >6h ago | matches only abandoned | yes | hygiene, hours | no |
| 12 | scheduledStatementHistorySnapshot | statements/history/scheduledSnapshot.ts | hourly | 24 | pages statements with `lastUpdate >= now-65min`; per statement with `evaluation`: research-flag lookup + history write | proportional to activity | yes (1 read); scales with activity | history resolution = 1h | no |
| 13 | sendDailyDigests | engagement/scheduled/dailyDigest.ts | hourly | 24 | 2 queries (`userEngagement.dailyDigest==true`, `notificationSettings.defaultFrequency==DAILY`), limit 500 each, then per-user `buildDailyDigest` | yes (<=1,000/run) | reads all enrolled users every hour even when none match the hour | hourly because of time zones: keep | local hour is per user; keep hourly |
| 14 | sendOdysseyDigests | odyssey/scheduled/odysseyDigest.ts | hourly | 24 | pages ALL `notificationSettings` with `odysseyDigest.enabled`, filters by local hour in code | no (O(enabled users) per run) | reads every enabled user every hour | hourly because of time zones: keep | same |
| 15 | sendWeeklyDigests | engagement/scheduled/weeklyDigest.ts | daily 10:00 UTC | 1 | 2 queries, limit 500 each, filtered by weekday in code | yes | most days nobody matches but all enrolled are read | daily | n/a |
| 16 | calculateStreaks | engagement/scheduled/streakCalculator.ts | daily 00:05 UTC | 1 | full scan of `userEngagement` (500/page) | no (O(users)) | writes only for lapsed streaks | daily | n/a |
| 17 | refreshUserStats | index.ts (~l.1114) -> fn_adminStats.ts | daily 00:10 UTC | 1 | one `count()` aggregation + 3 writes | yes | n/a | daily KPI | n/a |
| 18 | cleanupStaleTokens | fn_tokenCleanup.ts | daily 03:00 UTC | 1 | `pushNotifications` with `lastUpdate < now-60d`, no limit | matches only stale | yes after first run | daily | n/a |
| 19 | cleanupResearchLogs | fn_researchRetention.ts | daily 03:00 UTC | 1 | 1 query, BATCH_SIZE | yes | yes | daily | n/a |
| 20 | cleanupStatementHistory | statements/history/historyRetention.ts | daily 03:15 UTC | 1 | 1 query (`isResearch==0`, old), BATCH_SIZE | yes | yes | daily | n/a |
| 21 | studioPlanOutcomeSnapshot | organizations/studio/studioPlanOutcomeSnapshot.ts | daily 03:30 UTC | 1 | 1 query: built plans older than the delay, limit 100; per new plan reads its question tree | yes | yes | daily (outcome 30 days after build) | n/a. See finding F1 |
| 22 | scheduledDailyBackups | backups/scheduledDailyBackups.ts | daily 03:00 Asia/Jerusalem | 1 | active `surveys` + questions with `autoBackup==true` (unbounded `.get()`), then enqueues backup requests | scales with opted-in content | no, intended | daily | n/a |

Constants such as QUESTIONS_PER_TICK, batchSize, BATCH_SIZE were not all re-read; only
the order of magnitude (tens to hundreds) matters here.

### Invocations per day

| Group | Jobs | Runs/day |
|---|---|---|
| every 1 min | processSynthesisQueue, clusterRecomputeFlush | 2 x 1440 = 2880 |
| every 2 min | bulkFlush | 720 |
| every 5 min | heartbeat, studioScheduledActionSweep | 2 x 288 = 576 |
| every 10 min | reJudge | 144 |
| every 15 min | updateDeliberations, editingSessions | 2 x 96 = 192 |
| hourly | drift, votingDeadline, agoraSweep, historySnapshot, dailyDigests, odysseyDigests | 6 x 24 = 144 |
| daily | weekly, streaks, refreshUserStats, tokens, researchLogs, historyCleanup, planOutcome, backups | 8 |
| **Total** | | **4,664** |

Consistent with the ~4,500/day triage baseline.

**Before: 4,664/day. After this lane: 4,664/day** (no schedule changed, section 3).
This lane's saving is the Join always-on instance, not invocations.

### Quiet-day Firestore reads from polling (code-based estimate)

Fixed floor, one empty read per tick: 1440 + 1440 + 720 + 288 + 144 (reJudge probe)
+ 576 (studio, 2 queries) + 96 + 4 x 24 (drift, voting, agora, snapshot) + 3
(retention jobs) = about **4,800 reads/day**. On top of that:
- reJudge forced full sweep 4x/day, each up to 2,000 synth docs plus per-parent state
  reads: up to roughly 8,000 reads/day worst case.
- sendDailyDigests: up to 24 x (enrolled users, <=1,000). With ~232 recipients (dated
  memory note) this is on the order of 5,000-11,000 reads/day.
- sendOdysseyDigests: 24 x (Odyssey digest-enabled users).
- calculateStreaks: once, all `userEngagement` docs.
- sendWeeklyDigests: once, enrolled weekly users.
- RTDB: the 15-minute cleanup downloads whole subtrees (bandwidth, not Firestore reads).

Same before and after this lane. The user-count-scaled jobs (digests, streaks) are
larger than the empty-queue polling floor.

## 3. What I changed vs. recommended

Changed:
1. Join `minInstances` removed (section 1).

Deliberately NOT changed:
- **No fast-exit added.** Every high-frequency job (#1-#7, #9-#11) already starts with
  one bounded query and returns on empty, costing 1 read. A marker doc costs the same
  1 read and adds race windows between event triggers and the marker, and would touch
  synthesis queue semantics, which the brief says not to change without tests. reJudge
  already has a probe gate with a 6h forced full sweep. Since no fast exit was added,
  there are no new fast-exit unit tests.
- **No cadence change.** The 1- and 2-minute jobs are queue drains with a stated lag
  budget (clusterFlush: documented 60s; bulkFlush: 30s quiet period). Slowing them
  trades freshness of synthesis for one empty read and one empty invocation per skipped
  tick, not worth the semantics risk without product sign-off. Heartbeat, drift and
  reJudge are recovery backstops and are kept. Hourly digests are hourly because of
  time zones: kept.

Recommended (not implemented), most valuable first:
- **R1 Digest scans.** Store a denormalised UTC send hour on settings docs and query
  `==hour` so each hourly run reads only matching users instead of all enrolled users.
  Same for Odyssey digests (`hoursLocal` as UTC hours with `array-contains`). Needs a
  backfill; also removes the silent 500-user cap on the daily/weekly queries.
- **R2 Streaks.** Query only users with `streak.currentStreak > 0` (or unused grace)
  instead of scanning every `userEngagement` doc. Caveat: the grace-day branch today
  also writes for users with currentStreak 0; confirm that is not wanted first.
- **R3 clusterRecomputeFlush / processSynthesisQueue event-driven.** Cloud Tasks or a
  debounced doc trigger would remove up to ~2,900 invocations/day. Needs tests on lease
  and queue semantics. Simpler option: clusterFlush 1 -> 2 min if product accepts ~2 min
  lag; saves 720 invocations/day.
- **R4 Missing index (verified).** `firestore.indexes.json` still has no composite on
  `notificationQueue (status ASC, userId ASC, createdAt DESC)`, matching the dated memory
  note that `sendDailyDigests` errors per recipient daily. Add it via
  `gcloud firestore indexes composite create` (never a `--force` index deploy). Once
  fixed, digest emails will start going out, so expect a notification volume change.
- **R5 Lazy imports in index.ts** to shrink cold starts for every function, including
  scale-to-zero Join. Large change, own lane.

Findings (noticed, not fixed):
- **F1 studioPlanOutcomeSnapshot starvation.** It takes the first 100 `built` plans older
  than the delay and skips ones that already have `outcome` in code. Once 100 old plans
  have outcomes, newer plans are never reached, and each day re-reads those 100. Fix:
  mark snapshotted sessions with a queryable field and filter in the query (needs an
  index and a migration).
- **F2 sendDailyDigests** matches `userHour === targetHour`, where targetHour is the UTC
  hour and userHour the user's local hour; looks unintended. Not touched.

## 4. Rollout and rollback

Deploy only: `serveJoinShareRoutes`:
`npm run deploy:f:prod -- serveJoinShareRoutes` (no `--force`; this lowers the minimum).
Verify with a fresh share link (WhatsApp caches previews per URL) and a human click after
the instance has idled (Cloud Run scales to zero after ~15 min without traffic).
Rollback: restore `minInstances: 1` in `fn_joinShareRoutes.ts` and deploy with `--force`.

## 5. Monitoring

- `run.googleapis.com/container/startup_latency` for service `servejoinshareroutes`
  (cold start duration) and `container/instance_count` (confirms it reaches 0).
- `run.googleapis.com/request_latencies` p95/p99 for the same service, before vs after.
  Investigate if p99 for human clicks exceeds ~5s.
- Logs: `resource.type="cloud_run_revision" resource.labels.service_name="servejoinshareroutes" severity>=ERROR`,
  watching operations `joinShareRoutes.getAppShell` and `joinShareRoutes.handleShareRequest`.
- Hosting 5xx on `/q/**` and `/m/**`.
- `cloudfunctions.googleapis.com/function/execution_count` per scheduled function vs
  section 2 to confirm the 4,664/day baseline.

## 6. Remaining uncertainties

- Real cold-start latency of the monolithic functions bundle is unmeasured; it could exceed 2s.
- The "no requests for a month" for Join came from triage; if the inspected metrics missed
  Hosting-proxied traffic, cold clicks will be more frequent than assumed.
- Production data sizes (enrolled digest users, synth doc counts, Odyssey-enabled users)
  are unknown from code, so read estimates are order-of-magnitude.
- Whether the cluster polarization flag is ON in production (affects clusterFlush work,
  not its empty-tick cost).
