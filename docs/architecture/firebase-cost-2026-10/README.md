# Firebase cost reduction, October 2026

Two production batches cut Firestore reads/writes and Cloud Functions invocations without changing what users see. This page is the overview; the lane documents hold the designs.

| Lane | Document | Topic |
|---|---|---|
| A | [lane-a-feed.md](./lane-a-feed.md) | Home feed (`userFeed`) and subscription fan-out |
| B | [lane-b-results.md](./lane-b-results.md) | Evaluation results: participant counter, `isChosen` diff |
| C | [lane-c-read-state.md](./lane-c-read-state.md) | Read-tracking writes |
| D | [lane-d-infra.md](./lane-d-infra.md) | Infrastructure (Join `serveJoinShareRoutes` to zero) |

The lane documents are the plans; where they disagree with the code, the code wins.

## Batch 1 (shipped 2026-10-20)

- **Home feed.** A server-written `userFeed` collection (doc id = subscription id) feeds the home screen. Fan-out on discussion activity is throttled to at most one per minute per discussion through `userFeedThrottle`. Index: `userFeed(userId asc, lastActivity desc)`. Waiting members keep their home entry (`USER_FEED_ROLES`); banned members are hidden. `SUBSCRIPTION_ACTIVITY_STAMP_ENABLED` (`functions/src/userFeed/userFeedConfig.ts`, now `false`) stops stamping `lastUpdate` on every `statementsSubscribe` doc when a child statement is created. The client still has a legacy home fallback (`src/controllers/db/userFeed/listenToUserFeed.ts`) for users with no feed yet; it is to be removed later.
- **Participant count.** Marker docs `evaluationParticipants/{parentId}--{uid}` replace recounting. Once counted a participant stays counted, and neutral evaluations count. The trigger `updateStatementMemberCount` was deleted (member count now lives on create/delete in `fn_subscriptionLifecycle.ts`).
- **`isChosen`.** Results are written only when the chosen set actually changes.
- **Read tracking.** `lastReadTimestamp` is written when a discussion opens, plus at most once per 30 s while `lastChildUpdate` is newer; the write is a monotonic transaction.
- **Join.** `serveJoinShareRoutes` has no `minInstances` (scales to zero).

## Batch 2 (shipped 2026-10-21)

- **Client FCM token sync** (`src/services/notificationRepository.ts`, `syncTokenWithSubscriptions`). It used to rewrite every push-enabled subscription (`lastTokenUpdate`) on every app open. Now it skips without any query when the localStorage marker (`src/services/tokenSyncMarker.ts`, key `STORAGE_KEYS.FCM_TOKEN_SYNC`) shows the same user and token synced within `NOTIFICATION.TOKEN_RESYNC_INTERVAL` (1 week). Otherwise it writes `arrayUnion(token)` only to subscriptions that lack the token. The marker is written only after success and cleared by `removeTokenFromAllSubscriptions`. New subscriptions receive the token at creation (`NotificationService.getPushSubscriptionFields()`, `pushToken` parameter of `setStatementSubscriptionToDB`), because the backend reads `sub.tokens`.
- **Hot-trigger memory.** `functions/src/utils/createFirestoreFunction.ts` takes `options.memory`; `HOT_TRIGGER_MEMORY = '512MiB'` is set on `newEvaluation`, `updateEvaluation`, `deleteEvaluation`, `onStatementCreated`, `updateParentOnChildUpdate`, `validateRoleChange` and `handleWaitingRoleSubscriptions`. At 256 MiB they ran out of memory on about 17% of runs (`onStatementCreated` 60%), most likely because the large `index.ts` export graph is loaded on cold start.
- **Dead-token cleanup.** `functions/src/utils/removeSubscriptionTokens.ts` `removeTokensFromUserSubscriptions(db, userId, tokens)` queries `userId ==` plus `tokens array-contains-any` (chunks of 30, limit 500) and writes only `arrayRemove`, never `lastUpdate`. Used by `fn_notifications.ts` and `fn_tokenCleanup.ts`. The old code loaded all of a user's subscriptions (4,580 for one user), stamped `lastUpdate` on them and ran out of memory after 500, which caused bursts of 500 writes. One-off script: `functions/scripts/removeDeadSubscriptionTokens.ts` (dry run by default, `--execute` to write).

## Invariants future code must keep

1. **Never bulk-stamp `statementsSubscribe` docs.** Every write to one wakes two triggers (`validateRoleChange` on update, `handleWaitingRoleSubscriptions` on write), so a loop over a user's or a discussion's subscriptions multiplies into invocations and memory pressure. Activity goes to `userFeed` through `recordDiscussionActivity` and its throttle.
2. **Token cleanup writes `arrayRemove` only**, with no `lastUpdate` (clients order by it, and the write would wake the triggers).
3. **Hot triggers are 512 MiB**, set through `createFirestoreFunction` options (or `HOT_TRIGGER_MEMORY` on a direct `onDocument*` call). A new trigger on `statements`, `evaluations` or `statementsSubscribe` should use it.
4. **Push tokens are written at subscription create and synced only when missing.** Do not rewrite all subscriptions on app open; respect the sync marker.
5. **Participants are counted once** (marker doc), and results (`isChosen`, counters) are written only when the value changes.
6. **Read-state writes are throttled** (open, then at most every `UI.READ_MARK_THROTTLE_MS`), and never move `lastReadTimestamp` backwards.

## Measured results

- 2026-10-22, after batch 2: **0 out-of-memory errors on all 7 functions** (`newEvaluation` 0/95 runs, against 82/482 before), and no more 500-write bursts.
- Batch 1 targets and the before/after operation counts are in the lane documents (for example the read-state table in lane C).
