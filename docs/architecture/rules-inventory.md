# Who writes `/statements` and `/evaluations`

An inventory taken before tightening the rules on the two shared collections, so
the tightening is designed against what the product actually does rather than
against what it ought to do. Scope: main app `src/`, and `apps/{admin, studio,
mass-consensus, join, odyssey, sign, chat, flow, agora}`.

Companion to the executable assertions in `tests/rules/`. Written 2026-08-13.

## Why this exists

`/statements` and `/evaluations` are shared by every Freedi app, and Agora's
classroom content lives in them. Their rules were written for consenting adults
in a consensus tool; Agora puts minors and a scoring game on top of the same
documents. `tests/rules/` proves 14 holes by execution. This document is the
other half: which *legitimate* writes a fix must not break.

The headline: **the two collections are not equally tightenable.**
`/evaluations` has one write shape across the whole product and can be closed
almost completely. `/statements` has roughly a hundred distinct non-owner write
sites and cannot be closed the same way without a multi-app project.

---

## 1. The mechanism worth understanding first

`firestore.rules:285`

```
function isAllowedToUpdate() {
  return (!hasProtectedFieldChanges() &&
          !hasUnauthorizedAccessChange() &&
          !blocksDirectMembershipMutation()) ||
         isAuthorized();
}
```

Two branches. The second — `isAuthorized()`: creator, statement admin, parent
admin, top-parent admin, system admin, or Join delegate — is the one the
facilitator and admin surfaces of every app rely on. It is sound.

The first branch is the problem: **any authenticated user may write anything, so
long as no protected field changes.** And `hasProtectedFieldChanges()`
(`firestore.rules:244`) opens with

```
resource.data.keys().hasAll(['questionSettings', 'statementSettings'])
```

so a document lacking either key has *no* protected fields, and the branch
admits every write to it. Agora proposals carry neither key. They are not
incidentally exposed — they are structurally exempt from the only guard the
collection has. The same is true of any lightweight statement: chat messages,
paragraphs, evidence, cluster members.

A useful consequence: because admin surfaces already pass through
`isAuthorized()`, **narrowing or removing the permissive branch leaves most
admin functionality intact.** What it breaks is the set of writes made by
ordinary participants on documents they do not own — enumerated in §3.

## 2. `/evaluations` — closeable

One write shape, product-wide.

| App | Write site | `evaluatorId` | Doc id |
|---|---|---|---|
| main | `src/controllers/db/evaluation/setEvaluation.ts:67` | `creator.uid` (Redux) | `${uid}--${statementId}` |
| join | `apps/join/src/lib/userEvaluations.ts:101` | `user.uid`, skipped if absent | same |
| odyssey | `apps/odyssey/src/lib/evaluations.ts:52` | `user.uid`, early-return if absent | same |
| flow | `apps/flow/src/lib/deliberation.ts:492, :673` | `user.uid`, throws if absent | same |
| agora | `apps/agora/src/lib/proposals.ts:477` | `user.uid`, throws if absent | same |
| mc / sign / chat | — | Admin SDK only | — |

**No client anywhere writes an `evaluatorId` that is not the caller.** The doc-id
convention is uniform. The synthetic Agora raters (`agora-ai--{character}--{n}`)
are written only by `functions/src/agora/fn_agoraCharacterReview.ts:232,248`
through the Admin SDK; the client only ever filters them out on read
(`apps/agora/src/lib/proposals.ts:217`).

So `request.auth != null` plus `evaluatorId == request.auth.uid` is safe on
create and update. Four caveats, each with a fix:

- **Main-app writes take `evaluatorId` from Redux, not from `auth.currentUser`**
  (5 of 7 call sites). During an auth transition the Redux creator can lag the
  live token. Assert `creator.uid === auth.currentUser.uid` in
  `setEvaluationToDB` before the rule ships.
- **Flow replays queued offline evaluations** (`deliberation.ts:645-673`) with
  the `evaluatorId` captured at queue time. If the anonymous session changed in
  between, the replay carries a stale uid and will start being rejected. Re-stamp
  the uid at replay time.
- **Deleting is not own-doc-only today, and one real flow depends on that.**
  `src/controllers/db/evaluation/removeUserEvaluations.ts:52` deletes a *banned
  member's* evaluations, called from `banMember.ts:65`. An own-doc delete rule
  breaks it. Move it to a callable (correct — it is a moderation action) or carve
  out admins. `removeUserEvaluations.ts:111` deletes a user's evaluations
  globally and has no caller; it is account-deletion scaffolding.
- **Reads must stay open to any authenticated user.** Odyssey's opinion map
  (`apps/odyssey/src/lib/evaluations.ts:56-62`) reads everyone's evaluations for
  a game. Own-doc read gating would break it.

## 3. `/statements` — not closeable the same way

Roughly a hundred non-owner write sites. Most are admin surfaces already covered
by `isAuthorized()`. The ones that are **not** — ordinary participants writing to
documents they do not own — are the reason the permissive branch cannot simply be
deleted:

| Write | Site | Fields |
|---|---|---|
| Evidence voting (voter is never the author) | `src/controllers/db/popperHebbian/evidenceController.ts:253-340` | `evidence.helpfulCount`, `evidence.notHelpfulCount`, `lastUpdate` |
| Joining an option, incl. sibling cleanup under `singleJoinOnly` | `src/controllers/db/joining/setJoining.ts:81, :115, :124` | `joined`, `organizers` |
| Admin joining resets (direct writes, not the callable) | `apps/join/src/lib/join/joinCallables.ts:215, :284` | `joined: []`, `organizers: []`, `lastUpdate` |
| Parent bump on child create | `src/controllers/db/statements/condensationCuration.ts:383` | `lastChildUpdate`, `lastUpdate` |
| Facilitator brief | `src/controllers/db/compoundQuestion/saveQuestionScope.ts:38` | `brief`, `lastUpdate` |

Beyond those, the admin-gated surface is large and heterogeneous: visibility
(`hide`, `anchored`, `followMe`/`powerFollowMe`), ordering (`order`, `roomSize`),
reparenting (`parentId`, `parents`, `topParentId` — including
`deleteStatements.ts:57`, which rewrites `parentId` on every child of a deleted
statement), type changes, content edits on others' statements
(`updateStatementFields.ts:173-296`, `improveProposalController.ts:90,137`),
paragraph children (`paragraphStore.ts:41-52`, arbitrary patch), cluster curation
(`condensationCuration.ts`, `ClusterBoard.tsx`), and ~40 settings writers.

Two shapes that will trip a naive rule:

- **Full-document merge-overwrites of documents the caller does not own.**
  `statementSettingsCont.ts:152` re-runs `writeStatement.ts:121` on an existing
  statement, rewriting the whole document — including `creatorId`/`creator` read
  back from the *existing* doc. A creator pin on `update` (as opposed to
  `create`) breaks every admin settings save. Same shape at
  `promoteOptionToSubQuestion.ts:66`, where a deterministic id makes a re-run an
  update.
- **Agora's own retry path.** `createProposal` uses a deterministic id with
  `{merge: true}` (`apps/agora/src/lib/proposals.ts:438-447`), so a retry is an
  *update* carrying a full `createStatementObject` body — `statementSettings`
  defaults, `consensus: 0`, `createdAt` and all. Any "settings must be untouched"
  clause breaks the retry, and today the merge silently re-zeroes `consensus`.

`lastUpdate` is present in nearly every payload, because
`src/utils/firebaseUtils.ts:98` `updateTimestamp()` is the house style. Any
allowlist must include it or a large fraction of all writes fail.

## 4. Reads — three apps would break

`/statements` is `allow read;`. Requiring auth is not a rules-only change:

- **Chat has no anonymous-auth path at all.** `apps/chat/src/lib/firebaseClient.ts:6-10,52`
  deliberately loads Firestore *without* `firebase/auth` for public conversations
  — the auth SDK is excluded from the public bundle for first-paint budget — and
  `realtime.ts:28-45` opens `onSnapshot` on that unauthenticated handle. This is
  the hardest blocker: it needs a new auth path, not a guard.
- **Sign attaches listeners 2-6 seconds before signing in.** `AuthSync.tsx:113,133`
  delays anonymous login deliberately; six hooks
  (`useParagraphComments.ts:54`, `useParagraphSuggestions.ts:55,147,258,354`,
  `useSuggestionVisibility.ts:28`, `versionControlStore.ts:96`,
  `useRefinementPhase.ts:50`, `SuggestionThread.tsx:107`) mount unconditionally.
  Errors are swallowed into `logError`, so the symptom is silently empty comment
  and suggestion panes on first paint.
- **Join's shared chat links read before auth resolves.** `apps/join/src/views/Chat.ts:140-164`
  issues five `/statements` reads and only then awaits `waitForAuthReady()` —
  which resolves with `null` for a first-time visitor and signs nobody in;
  `Chat.ts` never calls `ensureUser()`. `serveJoinShareRoutes`
  (`functions/src/fn_joinShareRoutes.ts`) does **not** cover this: it serves
  crawlers from the Admin SDK and hands humans the plain SPA shell, which does
  its own client-side reads. Fix is one line — `await ensureUser()` at the top of
  `initChatForOption`.
- **Main app** has no unauthenticated read route, but no statement listener
  carries an auth guard either (`listenToStatements.ts` ×9,
  `optimizedListeners.ts:94,270`, `subscriptionManager.ts:46,56`), and sign-out
  resets Redux without unmounting them (`AuthStateContext.tsx:80-84`). Under an
  auth-required rule those become bursts of permission-denied. The pattern to
  copy already exists at `getEvaluation.ts:117`.
- **Mass-consensus is unaffected, for an alarming reason.** Its "anonymous users"
  are `anon_…` localStorage strings, not Firebase auth
  (`apps/mass-consensus/src/lib/utils/user.ts:11-13`), so they are
  `request.auth == null`. It survives only because all its statement I/O runs
  server-side on the Admin SDK. Any future client-SDK read there arrives
  unauthenticated.
- **Odyssey** is clean (Google-only, everything behind `<Protected>`), but its
  rule must permit a signed-in **non-creator, non-admin** player to read the whole
  game tree. Membership-based read gating would break it.

## 5. Identity: pin on `creatorId`

`createStatementObject()` (`packages/shared-types/src/models/statement/StatementUtils.ts:147-148`)
writes both `creatorId` and `creator`, both required by `StatementSchema`
(`StatementTypes.ts:78-79`), and every call site passes `creatorId: creator.uid`.
`isCreator()` (`firestore.rules:181`) checks `creatorId`. So `creatorId` is the
field of record.

It reads `resource`, which is null on create — **`isCreator()` cannot be reused in
a create rule.** A create rule needs
`request.resource.data.creatorId == request.auth.uid`.

One population will never satisfy a creator pin: **Sign mints `anon_…` cookie
identities** (`apps/sign/middleware.ts:64`) and stamps them into
`creatorId`/`evaluatorId` through Admin SDK API routes. Those documents have a
creator that is not, and can never be, a Firebase uid. They are only ever written
server-side, so rules do not block them today — but no client-side creator-gated
edit will ever apply to them.

## 6. What this implies

Ordered by ratio of safety bought to risk taken.

1. **Tighten `/evaluations` product-wide.** One write shape, no foreign
   `evaluatorId` anywhere, uniform doc ids. Fixes forged ratings and
   `agora-ai--*` impersonation — the holes that corrupt Agora's scoring. Needs
   three small client changes (§2).
2. **Add an Agora-scoped branch to `/statements`.** Documents carrying
   `agoraSessionId` get creator-only updates and authenticated,
   session-scoped reads. This is *additive*: no other app writes or queries
   documents with that field, so it cannot regress them. It closes proposal
   vandalism, `suggestionStatus` forgery, weave-credit farming and public
   readability of minors' writing — without waiting on the project below.
   Design note: Agora's own listeners already filter on `agoraSessionId`
   (`apps/agora/src/lib/proposals.ts:158`), so a rule keyed on that field is
   evaluable for list queries.
3. **Then, as its own tracked project, close the permissive branch on
   `/statements` product-wide.** This is the multi-week item: an allowlist
   covering §3, auth guards on the main app's listeners, the Join `Chat.ts` fix,
   Sign's listener gating, and a genuine anonymous-auth path for Chat. It should
   not gate a classroom.
