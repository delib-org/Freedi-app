# Lane C - read-state writes (task t4)

## The read-tracking chain

1. `StatementMain.tsx` mounts for a discussion.
2. Before: an effect with deps `[statementId, statement, user?.uid]` called `updateLastReadTimestamp(statementId, uid)` on every change of the `statement` object (consensus, counts, `lastChildUpdate`, ...).
3. `updateLastReadTimestamp` (`src/controllers/db/subscriptions/setSubscriptions.ts`) did `getDoc` then `updateDoc` on `statementsSubscribe/{uid}--{statementId}` (`lastReadTimestamp`, `statementId`).
4. Every write to that doc fires 3 Cloud Functions triggers (`functions/src/index.ts` ~l.680-733 on `statementsSubscribe/{subscriptionId}`).

So each avoided write saves 1 read + 1 write + 3 invocations.

## After

- `useMarkDiscussionRead` (`src/view/pages/statement/hooks/useMarkDiscussionRead.ts`):
  - one write when the discussion opens (statementId / user change, after the statement has loaded);
  - while open, a further write only when `statement.lastChildUpdate` advanced past what the last write covered, at most once per `UI.READ_MARK_THROTTLE_MS` (30 s, `src/constants/common.ts`), with a trailing write at the end of the window;
  - nothing while `document.visibilityState === 'hidden'`; when the tab becomes visible and there is something unrecorded, it writes (still respecting the 30 s window).
- `updateLastReadTimestamp` now runs one `runTransaction`: `get` + conditional `update`, only if `Date.now()` is greater than the stored `lastReadTimestamp`. No separate `getDoc`. A missing subscription doc: no write, no throw, no error log. The transaction costs the same 1 read + 1 write as before when it writes, and 1 read / 0 writes when it does not; the `update` is a normal update, so `firestore.rules` needed no change.

Why `lastChildUpdate`: the server (`fn_statement_updates.ts` `updateParentOnChildUpdate` / create trigger) sets it on the parent whenever a child is created or its content changes. It is the same field the client uses for activity ordering (`getLatestChildActivity` in `statementsSlice.ts`). The statement's own consensus/counts do not move it.

## Unread-indicator consumers

Searching the repo (`src`, `functions/src`, `apps/*`, `packages`), `lastReadTimestamp` is **only written** (setSubscriptions.ts) and declared (shared-types `StatementSubscription`); **nothing compares it**. Existing "unread" UI is driven by other state:
- `NotificationBtn`, `BottomNav`, `AppThinkingSpace`, `AnswerChatSheet`, `NotificationCard`: use `notification.read` on notification docs (unchanged).
- `statementsSlice.getLatestChildActivity`: sorts by `lastChildUpdate` (unchanged).

So no existing indicator regresses. A future "unread since" badge would compare `statement.lastChildUpdate > subscription.lastReadTimestamp`; with this change `lastReadTimestamp` is at most ~30 s stale while a discussion is open and is guaranteed to cover the newest content seen at the last write.

## Before / after: 10 minutes open, 60 consensus updates, 20 new messages

Assumption: each update re-emits the statement object once, so the old effect ran 1 (open) + 60 + 20 = 81 times. (Counts below are for the open discussion's subscription doc.)

| | Reads | Writes | Trigger invocations |
|---|---|---|---|
| Before | 81 | 81 | 243 |
| After, messages clustered in 5 bursts | 6 | 6 | 18 |
| After, worst case (messages spaced >= 30 s apart, 20 windows) | 21 | 21 | 63 |
| After, if the 60 consensus updates are on the statement itself | same as above - they cause 0 writes | | |

Note: if the "60 consensus updates" are evaluations of child options, they also bump the parent's `lastChildUpdate` (any content change on a child does), so they count as new content; the 30 s throttle then bounds the total to at most 1 + 600/30 = 21 writes regardless of update volume.

Tests: `hooks/__tests__/useMarkDiscussionRead.test.ts` (unrelated changes -> 0 writes; open -> 1; burst of 10 -> 2; hidden -> 0 until visible; unmount -> none) and `subscriptions/__tests__/setSubscriptions.test.ts` (never writes an older timestamp; missing doc -> no throw, no write).

## Remaining uncertainties

- The analytics effect in `StatementMain.tsx` (`trackStatementView`) keeps its old deps and still re-runs on every statement update; it is not a Firestore write, left alone.
- Closing the tab/navigating away does not do a final flush; the last mark can be up to 30 s behind the newest content seen. Acceptable since nothing reads it today.
- Leading edge of an already-throttled re-open: reopening the same discussion resets the window (a fresh open always writes once).
- Clock skew between devices: the transaction compares device `Date.now()` values; a device with a clock far in the future could pin the stored value. Server timestamps are not used (house rule: ms from client).
- Cannot verify trigger counts from the emulator here; the 3 triggers per write come from the registrations in `functions/src/index.ts`.

## Follow-up idea

Personal read state could move off the shared subscription doc (which fans out to 3 triggers on every write) into a per-user doc, e.g. the `userFeed` collection another lane is creating, so read marks trigger no functions at all.
