# Lane A — Activity feed (`userFeed`) and subscription fan-out

Branch `feat/firebase-cost-feed` (from `dev` ce6089543). Tasks t1 + t5 of the
October 2026 Firebase cost batch.

## 1. The problem, measured against the code

Baseline (prod, 2026-10-20, dated): ~417k executions/month across three
subscription triggers; ≥33,825 subscription writes that only moved an activity
timestamp; reads 34k/day → 255k/day.

What the code on `dev` actually did:

- `updateTopParentSubscriptions` (fn_statement_updates.ts) ran from
  `updateParentOnChildUpdate` and `updateParentOnChildDelete` for any
  **nested** child (parentId ≠ topParentId). `hasContentChange` included
  `before.consensus !== after.consensus`, so **every evaluation that moved an
  option's consensus** re-stamped up to 500 subscriptions (1-second guard only).
- Each stamped subscription woke three triggers: `handleWaitingRoleSubscriptions`
  (onWritten, returns early on metadata), `validateRoleChange` (onUpdated),
  `updateStatementMemberCount` (onWritten, returns early on updates). An early
  return still costs an invocation.
- New messages (`onStatementCreated`) did **not** stamp anything since the
  earlier fan-out removal, so the server-side home order (subscriptions by
  `lastUpdate`) followed consensus changes, not new content. The client
  re-sorted loaded items by `lastChildUpdate` / `lastSubStatements`, but an old
  discussion outside page 1 could not come back to page 1 on new content.

## 2. Update-chain map (after)

```mermaid
flowchart TD
  C[statement created, parentId ≠ top] --> P[updateParentForNewChild: parent preview + lastChildUpdate]
  C --> A[recordDiscussionActivity topParentId]
  E[child text edit: title / paragraphs] --> P2[updateParentWithLatestChildren]
  E --> A
  R[consensus / evaluation / results / totalEvaluators / isChosen] -->|NOT activity| X[stop: clients get it via statement listeners]
  D[child deleted] --> P3[parent counts + preview] -->|NOT activity| X2[no member writes]
  A --> T{userFeedThrottle tx: last fan-out < 60s?}
  T -->|yes| N[stop: 1 read, 0 writes]
  T -->|no| F[userFeed: lastActivity for every member, pages of 500 — NO triggers]
  T -->|no, phase 1 only| S[statementsSubscribe.lastUpdate — wakes handleWaitingRole + validateRoleChange]
  M1[subscription created] --> L1[onSubscriptionCreatedMembership: count() + reconcile feed entry]
  M2[subscription deleted] --> L2[onSubscriptionDeletedMembership: count() + reconcile feed entry]
  M3[subscription updated] --> L3[validateRoleChange: ban guard; if role changed → reconcile feed entry]
```

"Reconcile" reads the subscription's current state and creates the feed entry
(top-level + role admin/creator/member) or deletes it. It never overwrites an
existing entry's `lastActivity`, and it is trigger-order independent (a late
delete trigger after a quick re-join keeps the entry).

### Ownership

| Concern | Lives in | Written by | Read by |
|---|---|---|---|
| Content | `statements/{id}` text, `paragraphs` | clients | statement listeners |
| Results | `consensus`, `evaluation.*`, `results`, `totalEvaluators`, `isChosen` | evaluation triggers (lane B) | statement listeners / delta listeners (`lastUpdate` watermark) |
| Parent preview | parent `lastSubStatements`, `lastChildUpdate`, `description` | `updateParentForNewChild`, `updateParentWithLatestChildren` (content only) | home overlay sort |
| **Activity (home order)** | `userFeed/{uid}--{topId}.lastActivity` | `recordDiscussionActivity` (server only) | home topics listener + pager |
| Membership | `statementsSubscribe` role, `numberOfMembers` | clients/admins; count by lifecycle triggers | rules, UI |
| Personal read state | `statementsSubscribe.lastReadTimestamp` | client (lane C throttles it) | unread indicators |

### What counts as activity

| Event | Before | After |
|---|---|---|
| New child (message/option/question/paragraph) anywhere in a discussion | nothing server-side | **activity** (coalesced) |
| Text edit of a nested child | stamped subs | **activity** (coalesced); now also for direct children of the top statement |
| Consensus / evaluation / result / count change | stamped subs (≤500, every evaluation) | **not activity**, and the parent preview is no longer rewritten either |
| Child deleted | stamped subs | not activity (parent counts/preview still refreshed) |

## 3. Queries, indexes, rules touched

- New collection `userFeed/{userId}--{topParentId}`: `{ feedId, userId, statementId, subscriptionId, lastActivity, createdAt }`
  (shared-types `UserFeedItemSchema`, `Collections.userFeed`). The id equals the
  top-level subscription id; `subscriptionId` is stored anyway for legacy ids.
- New collection `userFeedThrottle/{topParentId}`: `{ statementId, lastFanoutAt }`, server only.
- Progress doc `_migrations/backfillUserFeed` (backfill cursor), server only (no rule → denied).
- Index added: `userFeed (userId ASC, lastActivity DESC)`. Fan-out query
  `userFeed where statementId ==` uses the automatic single-field index. No index removed.
- Member count: `count()` aggregation over the **same** filter
  (`statementId ==`, `statementType != 'document'`) instead of downloading every doc.
- Rules: `userFeed` read only when `resource.data.userId == auth.uid` (null-guarded), no client writes;
  `userFeedThrottle` deny all. Tests: `tests/rules/userFeed.test.mjs`.
- Home client: topics = `userFeed where userId == uid orderBy lastActivity desc limit 30` (live),
  plus one doc listener per subscription on that page; pager = same query `startAfter(oldest lastActivity) limit 31`
  then `getDoc` for exactly those subscriptions. Discussions tab unchanged, but its cursor
  is now tracked from its own query results (`discussionsCursor.ts`) so subscriptions
  pulled in by the feed cannot make it skip pages.
  Fallback: a user whose feed is empty on first snapshot also gets the legacy listener.

### Readers of `statementsSubscribe` ordered by `lastUpdate` (all apps)

| Reader | Effect of phase 2 (subs no longer stamped on activity) |
|---|---|
| `src/.../getSubscriptions.ts` `listenToStatementSubscriptions` / `fetchOlderTopSubscriptions` | replaced by `userFeed` for home topics; kept as fallback only |
| `src/.../getSubscriptions.ts` `getNewStatementsFromSubscriptions` / `fetchOlderDiscussionSubscriptions` (Discussions tab) | order of top-level rows comes from the feed via the Redux sort; sub-statement subs were never stamped |
| `src/controllers/db/search/getSearchCandidates.ts` (top 1000 candidates by lastUpdate) | "recent" candidate window follows membership/read changes instead of activity — minor |
| `apps/sign/src/lib/firebase/homeQueries.ts` `getSubscribedDocuments` (isDocument subs) | a top-level Sign doc no longer rises on nested edits; direct-paragraph edits never stamped subs — minor |
| `packages/event-core/src/myEvents.ts` | sorts by statement `lastUpdate` first — unaffected |
| MC, Agora, Studio, Join | no `lastUpdate` ordering on subscriptions — unaffected |

## 4. Operation counts — one activity in a discussion with N members

Instrumented with an in-memory Firestore (`functions/src/userFeed/__tests__/operationCounts.test.ts`,
legacy path replayed from the removed function). Reads include the throttle read.

| Scenario | N | reads | writes | membership trigger invocations | statement writes |
|---|---|---|---|---|---|
| **before**, per nested edit **or consensus change** | 10 | 11 | 11 | 30 | 1 |
| | 100 | 101 | 101 | 300 | 1 |
| | 1000 | 501 (capped) | 501 (capped) | 1500 | 1 |
| **phase 1**, first activity in a minute | 10 | 21 | 21 | 20 | 0 |
| | 100 | 201 | 201 | 200 | 0 |
| | 1000 | 2003 | 2001 | 2000 | 0 |
| **phase 2**, first activity in a minute | 10 | 11 | 11 | 0 | 0 |
| | 100 | 101 | 101 | 0 | 0 |
| | 1000 | 1002 | 1001 | 0 | 0 |
| further activity, same minute (both phases) | any | 1 | 0 | 0 | 0 |
| consensus / results change (both phases) | any | 0 | 0 | 0 | 0 |

Notes:
- "before" for a **new message** was 0/0/0 — and that is the bug: the server order did
  not follow new content. Per window, after costs about what before cost per *edit*.
- The before path also wrote the top statement's `lastUpdate`; each statement write wakes
  ~15 statement-level onUpdated/onWritten triggers. The after path does not write the top
  statement (decision 4). `onStatementCreated` still writes the direct parent as before.
- Real volume win: consensus changes were per evaluation (1-second guard); they now cost 0.
  Bursts of messages collapse to one fan-out per minute.
- Membership events: +1 read (reconcile reads the subscription) and +1 write (feed entry);
  the member count is now a `count()` (1 read per 1000 entries) instead of N reads.
  `updateStatementMemberCount` no longer runs on any subscription UPDATE (incl. lane C's
  `lastReadTimestamp` writes): one invocation less per subscription update, forever.
- Reads on the home page: first page = 30 feed docs + 30 subscription docs (was 30
  subscription docs). Updates on page 1 cost 1 feed read per moved discussion.

## 5. Rollout

Phase 1 (commits t1, t5):
1. Create the `userFeed (userId ASC, lastActivity DESC)` index — via gcloud
   (`gcloud firestore indexes composite create --collection-group=userFeed --field-config=field-path=userId,order=ascending --field-config=field-path=lastActivity,order=descending`);
   never a `--force` index deploy.
2. Deploy rules (`firestore.rules`, whole file — merge main first).
3. Deploy functions: `onSubscriptionCreatedMembership`, `onSubscriptionDeletedMembership`,
   `validateRoleChange`, `onStatementCreated`, `updateParentOnChildUpdate`, `updateParentOnChildDelete`.
   Then delete `updateStatementMemberCount` (new pair already counts; counting twice is idempotent).
4. Backfill: `cd functions && GCLOUD_PROJECT=<proj> npx tsx scripts/backfillUserFeed.ts --execute --max-pages=50`
   until it prints `"done": true` (dry run first without `--execute`).
5. Deploy main-app hosting (reads `userFeed`).

Phase 2 (separate commit): `SUBSCRIPTION_ACTIVITY_STAMP_ENABLED = false` in
`functions/src/userFeed/userFeedConfig.ts`; redeploy `onStatementCreated`,
`updateParentOnChildUpdate`. Ship only after hosting from step 5 is live and old
tabs have had time to reload.

Rollback: phase 2 → flip the constant back and redeploy those two functions.
Phase 1 client → the legacy listener is still in the code (`listenToStatementSubscriptions`);
point `Home.tsx` back at it. Functions → redeploy the previous build and
recreate `updateStatementMemberCount`.

Monitoring: invocations of `handleWaitingRoleSubscriptions` / `validateRoleChange`
(should fall after phase 2); log line `userFeed activity for` count per hour;
`_migrations/backfillUserFeed`; Firestore reads/day; errors with operation
`userFeed.*` / `subscriptionLifecycle.*` in Sentry.

## 6. Decisions made alone

1. Collection names `userFeed` and `userFeedThrottle`; feed id = subscription id.
2. Activity = new child anywhere in the discussion (incl. direct children, which never stamped
   before) + title/paragraph edits. Deletions and all result/count changes are not activity.
3. Consensus-only changes no longer refresh the parent's `lastSubStatements` / `lastChildUpdate`.
   The consensus number inside a parent's preview may lag until the next content change.
4. The top statement's `lastUpdate` is no longer bumped by nested activity (it woke ~15 statement
   triggers and nothing that sorts the home page reads it). Delta listeners still see the direct
   parent's bump.
5. Leading-edge throttle: the first activity in a window fans out; later activity in that minute is
   not re-stamped, so `lastActivity` can lag real activity by up to 60 s.
6. Feed roles: admin, creator, member. Waiting/banned/unsubscribed members lose the topic from the
   home topics list (they were listed before). Approval brings it back.
7. Member count semantics unchanged (every role counts, Sign-document subs do not), so no update trigger.
8. Fan-out pages through all members (no 500 cap); a member who leaves mid-fan-out is skipped, never resurrected.

## 7. Remaining uncertainties / follow-ups

- **Personal read state**: `lastReadTimestamp` on the subscription still wakes
  `handleWaitingRoleSubscriptions` + `validateRoleChange` (2 invocations per write after this lane;
  3 before). Moving it to `userFeed` (a `lastReadAt` field, the only client-writable field there,
  rules-guarded to own doc and that field) would remove those invocations entirely. Sensible
  follow-up; not implemented here (lane C owns the write).
- `handleWaitingRoleSubscriptions` is still onDocumentWritten; splitting it into create + update
  would save the delete invocation. Renames a deployed function, so left alone.
- Ties on `lastActivity` across the page boundary can skip an item (same as the old `lastUpdate` pager).
- The count of statement-level triggers (~15) is from the source, not from deployed function list.
- Not exercised against the full functions emulator; behaviour is proven with the in-memory
  Firestore (functions) and the Firestore emulator (rules + query order).
