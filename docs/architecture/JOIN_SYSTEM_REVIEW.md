# Join Subsystem Architecture Review

**Author**: System Architect agent (audit run 2026-05-10)
**Scope**: backend join functions, Mithril Join app store, shared Join types, Firestore rules, Sheet sync surface
**Status**: review draft — implementation tracked in plan `imperative-wondering-bear.md`

---

## TL;DR — Recommendations First

The system works, and the three recent fixes (sheet column-shift, missed cancel→rejoin sync, wrong-row deletion) were correct. But the architecture has four shapes of fragility that will keep producing "one fix per week" bugs unless we address them:

1. **Form data has no real backup.** The 7-day TTL on `joinRegistrationBackups` is a debugging aid, not a backup — and the membership-event row only captures `uid + displayName`, dropping the phone/email/custom fields the user explicitly cares about. Closing this gap is the **P0** outcome of this review.
2. **The same auth check is hand-rolled in three callables.** "Creator OR admin sub OR delegate" lives in `fn_createOrganizerSuggestion`, `fn_reconcileJoinSheet`, and `fn_createJoinDelegateInvite` (in slightly different forms). Next callable to add this will copy-paste it again, with one subtle drift.
3. **Sheet schema has no version pin.** The "legacy 9-col vs 10-col" footgun is patched (we now build rows from the live header) but the underlying drift mechanism — the trigger silently accepting whatever header the sheet has — is still there. A future column addition will reproduce the class of bug.
4. **The Join store is doing too much.** `apps/join/src/lib/store.ts` is 2323 lines with at least 8 distinct responsibilities (auth, options, evaluations, chat counts, delegates, join membership, form-skip cache, facilitator). The form-skip cache and the membership writer are the two pieces that have produced bugs; both deserve to be modules in their own right with their own tests.

**Prioritized roadmap, condensed:**

| P | Item | Effort |
|---|------|--------|
| P0 | Promote `joinFormSubmissions` to durable backup with form-data snapshots | M (~1 day) |
| P0 | Extract shared `assertJoinAdminAuthorized(uid, questionId)` helper | S (~2 hr) |
| P0 | Add `schemaVersion` to sheet header row + refuse to write to mismatch | S (~3 hr) |
| P1 | Decompose `apps/join/src/lib/store.ts` into named modules | M (~1 day) |
| P1 | Replace 33 `console.error()` calls in join functions with `logError()` | S (~2 hr) |
| P1 | Test harness: `findRowIndex` / `diffMembers` / `toggleJoining` cap logic | M (~1 day) |
| P1 | Cross-tab cache invalidation on `joinFormSubmittedRole` | S (~2 hr) |
| P2 | Promote sheet sync to a durable outbox (queued retry) | L (~2-3 days) |
| P2 | Observability: structured operation IDs + a single dashboard | M (~1 day) |
| P2 | Document the end-to-end happy path in `docs/architecture/JOIN_DATAFLOW.md` | S (~2 hr) |

P0 items are described in concrete detail in §4. The rest are sketched in §5.

Open product questions are at §6 — read them before approving.

---

## 1. Current Architecture (Diagram)

```
                                                    ┌─────────────────────────┐
                                                    │  Google Sheet (admin's) │
                                                    │   downstream copy       │
                                                    └────────────▲────────────┘
                                                                 │ append/delete
                                                                 │ (one row per
                                                                 │  user×option×role)
                                                                 │
        Mithril Join app (apps/join)                  Cloud Functions (region: me-west1)
        ──────────────────────────                    ──────────────────────────────────
                                                                 │
                                                                 │
   ┌──────────────────┐ click join                                │
   │ SolutionCard.ts  │──────────────────► handleJoin            │
   │  (handleJoin)    │                          │                │
   └──────────────────┘                          │                │
                                                 ▼                │
   ┌──────────────────┐  no submission yet?                       │
   │ JoinFormModal.ts │◄──── open modal                           │
   │ (form fields)    │                                           │
   └────────┬─────────┘                                           │
            │  saveJoinFormSubmission                             │
            ▼                                                     │
       ┌─────────────────────────────────────┐                    │
       │ statements/{qid}/joinFormSubmissions│  ─── trigger ────► │ fn_backupJoinFormSubmission
       │   /{userId}                         │                    │  → joinRegistrationBackups
       │   { values, displayName, role }     │                    │     (TTL 7d)
       └─────────────────────────────────────┘                    │
            │                                                     │
            │ then toggleJoining (transaction)                    │
            ▼                                                     │
       ┌─────────────────────────────────────┐                    │
       │ statements/{optionId}               │  ─── trigger ────► │ fn_syncOptionMembersToSheet
       │   { joined: Creator[],              │                    │  ├─ diff before/after
       │     organizers: Creator[] }         │  ─── trigger ────► │ fn_backupOptionMembership
       │   ◄── SOURCE OF TRUTH               │                    │  └─ joinRegistrationBackups
       └────────────┬────────────────────────┘                    │     (TTL 7d, uid+name only)
                    │ onSnapshot                                  │
                    │                                             │
                    │              (admin actions)                │
                    │              ┌───────────────────────────►  fn_reconcileJoinSheet (callable)
                    │              │                              fn_removeUserFromSheet (callable)
                    │              │                              fn_createOrganizerSuggestion
                    │              │                              fn_resolveJoinIntents
                    │              │                              fn_createJoinDelegateInvite
                    │              │
   ┌──────────────────┴──────────────────┐
   │ store.ts (Mithril, 2323 lines)      │
   │  ├─ joinFormSubmittedRole cache     │  ◄── load-bearing for "skip form" UX
   │  ├─ joinFormSubmissionCache         │  ◄── invalidated on save/delete only
   │  ├─ toggleJoining (transaction)     │
   │  ├─ resetQuestionJoining (admin)    │
   │  └─ delegate subscriptions          │
   └─────────────────────────────────────┘
```

### Component map

| Component | File | Role |
|-----------|------|------|
| Sheet sync trigger | `functions/src/engagement/joinForm/fn_syncOptionMembersToSheet.ts` | Drives sheet from option-doc diff |
| Form submission backup | `functions/src/engagement/joinForm/fn_backupJoinRegistration.ts` (`fn_backupJoinFormSubmission`) | Snapshots form writes to TTL'd audit |
| Membership backup | same file (`fn_backupOptionMembership`) | Snapshots `joined`/`organizers` diffs to TTL'd audit |
| Sheet reconcile | `functions/src/engagement/joinForm/fn_reconcileJoinSheet.ts` | Admin-callable backfill, idempotent |
| Sheet remove | `functions/src/engagement/joinForm/fn_removeUserFromSheet.ts` | Used only by `resetQuestionJoining` admin action |
| Organizer suggestion | `functions/src/engagement/joinForm/fn_createOrganizerSuggestion.ts` | Creator-elevated option create |
| Resolve intents | `functions/src/engagement/joinForm/fn_resolveJoinIntents.ts` | One-time activate/fail flip |
| Delegate invite | `functions/src/engagement/joinDelegate/fn_createJoinDelegateInvite.ts` | (sibling auth check, same shape) |
| Sheets client | `functions/src/engagement/joinForm/getGoogleSheetsClient.ts` | Service-account factory |
| Operational scripts | `functions/scripts/reconcileJoinSheet.ts`, `dumpSheetForDebug.ts` | Manual backfill, sheet dump |
| Mithril store | `apps/join/src/lib/store.ts` (2323 lines) | All Join app state + writers |
| Form modal | `apps/join/src/components/JoinFormModal.ts` | First-join form |
| Limit modal | `apps/join/src/components/LimitReachedModal.ts` | Cap swap UI |
| Card entry point | `apps/join/src/components/SolutionCard.ts` (`handleJoin`) | Where it all starts |
| Types | `packages/shared-types/src/models/statement/JoinFormSubmission.ts`, `StatementSettings.ts`, `models/joinDelegate/JoinDelegate.ts` | Schemas |
| Rules | `firestore.rules:188-236` (submissions, resolutionUsers), `:920-966` (delegates) | Authz |

---

## 2. Invariants & Source of Truth

| State | Where it lives | Authoritative? | Writers | Readers | Must agree with |
|-------|----------------|----------------|---------|---------|------------------|
| "Is user U joined to option O in role R?" | `Statement.joined[]` / `Statement.organizers[]` on the option doc | **YES** | `toggleJoining` (client transaction), `resolveJoinIntents` (clear-on-fail), `resetOptionJoining` / `resetQuestionJoining` (admin) | Join app `getVisibleOptions`/`getUserCommittedOptions`, sheet trigger, reconcile, backup, resolve | Sheet (eventually consistent); `joinFormSubmissions` (only loosely — see below) |
| User's form payload (name, phone, email, custom) | `statements/{qid}/joinFormSubmissions/{uid}` | **YES** for form data | `saveJoinFormSubmission` (client), reset/wipe (admin) | `appendUserRow`, `JoinFormModal` rehydrate, admin reset | Backup audit (eventually) |
| Cached "skip form?" flag | client: `joinFormSubmittedRole` Map | derived, advisory | `saveJoinFormSubmission`, `getJoinFormSubmissionData`, `resetQuestionJoining` | `handleJoin` optimistic skip | `joinFormSubmissions` (corrects on next fetch) |
| Sheet rows | Google Sheet (per-tenant) | **NO** — downstream copy | `appendUserRow`, `removeUserRow` (trigger); `appendUserRow` (reconcile) | Admin's eyes only | Option arrays + submissions (eventually consistent) |
| Audit | `joinRegistrationBackups` (TTL 7d) | **NO** — debugging only | Both backup triggers | Operator with admin SDK | (no — stale by design) |
| Delegate role | `joinDelegates/{qid--uid}` | **YES** | callables only (Admin SDK) | client live snapshot, server auth checks | — |

### Invariant statements (the contracts the system promises)

1. **I1.** For every `(userId, optionId, role)` tuple where the user appears in the option's `joined`/`organizers` array, **eventually** there exists exactly one row in the sheet with the same triple. *Today: enforced by the sheet trigger + reconcile, not transactionally.*
2. **I2.** A user has at most one `joinFormSubmissions/{userId}` doc per question, regardless of how many options they joined. *Today: enforced by the doc id being `uid`.*
3. **I3.** A user's submission `role` reflects the role on their **most recent** join click, not necessarily every option they're on. *This is a design choice, but it's not stated anywhere — see §3 finding #2.*
4. **I4.** When a user un-joins option A while still on option B, only A's sheet row is removed. *Today: enforced by `findRowIndex` requiring an affirmative option match.*
5. **I5.** A reset wipes options + submissions + sheet rows, leaving caches empty on the resetting tab. *Today: holds within one tab; cross-tab is broken — see §3 finding #7.*

The risk is that **none of these invariants are enforced by code that's structurally hard to violate**. They're upheld by a careful trigger + careful client code. The next refactor that changes either side has to remember all five.

---

## 3. Findings

### 3.1 Source of truth & invariants — **OK, but undocumented**

**Strengths.** The pivot to making option arrays the SoT (and driving the sheet from their diff) is the correct primitive. It naturally handles the "user joins B without form modal" case and admin-direct `joined` writes. The `Statement` doc is already the single transactional unit for membership.

**Weaknesses.**
- The fact that "submission role tracks last click only" (I3) is a side-effect of `setDoc(..., {merge: true})` overwriting `role` on every save — it works for the modal-skip UX but isn't named. A future eng changing the cache key from `(qid, uid)` to `(qid, uid, role)` will produce surprising behavior.
- `JoinFormSubmission.optionId` / `optionTitle` (`JoinFormSubmission.ts:27-28`) capture the option of the **most recent** join click. They're misleading — they're not "the option this submission applies to," they're "the option the user happened to click on when they last opened the form." Since the data model is "one form per question, reused across options," these fields shouldn't exist. **Action**: deprecate them or rename to `lastClickOptionId`.

**Risk.** Low today, but the underspecified contract is a documentation hazard.

### 3.2 Trigger model — **Right primitive, with two leaks**

**Strengths.** Driving sheet sync from option-doc diffs (`fn_syncOptionMembersToSheet.ts:57-212`) is correct. The cluster/`integratedInto` skip (`:86-88`) keeps a clustering run from burning the trigger on every produced cluster. The diff function (`:219-241`) is clean.

**Weaknesses.**
1. **The trigger fires on every option write.** A typo fix that updates `statement` (the option title) wakes up this trigger and reads the question doc just to discover there's no `joinForm` configured (`:117-120`). On a question with hundreds of options, an admin batch re-title floods the Sheets API quota. **Fix**: short-circuit on `before.joined === after.joined && before.organizers === after.organizers` *before* loading the question doc. Currently the diff is computed first (good), but we then proceed to read the question doc unconditionally.
2. **`questionId` is loaded into a closure but the question doc's `joinForm` is read fresh on every diff event.** A burst of joins on the same question costs N reads for the same config. **Fix**: read-through cache keyed by questionId with a 30s TTL.

**Risk.** Medium. Today's volumes don't hit Sheets quotas, but a single high-traffic admin event could.

### 3.3 Sheet schema versioning — **Patched, not solved**

The legacy 9-col / new 10-col mismatch was patched by `buildRowFromHeader` in `fn_syncOptionMembersToSheet.ts:291-313` — it walks the existing header and lands each value in its column. This is the right fallback. But:

**Weaknesses.**
1. There's no schema version in the sheet itself. A future addition like a `phone_country` column would reintroduce the silent drift — appended rows would have empty phone_country cells, removes would still match by userId+optionId (fine), but anyone reading the sheet would get stale data.
2. `ensureHeaderRow` (`:243-262`) only writes the header when the sheet is empty. There's no path to migrate an existing 9-col sheet to 10-col — admins have to manually edit the header to add `optionId`, and the trigger silently won't backfill it for existing rows.
3. Header trim logic (`:293`) catches whitespace, but nothing catches case drift (`'OptionId'` vs `'optionId'`) — admins hand-edit headers.

**Fix.** Three layers, in order of strength:
- **L1 (lightest).** Add a hidden `_schemaVersion` cell at, say, `Z1`. The trigger reads it, compares to a hardcoded `CURRENT_SHEET_SCHEMA_VERSION`, and refuses to write if newer (admin downgraded the trigger, would corrupt) or migrates if older.
- **L2.** Move sheet data to a versioned tab name: `Members_v1`, `Members_v2`. Migrating means appending a new tab, never mutating the old. Old data stays readable.
- **L3.** Stop using a sheet as the durable copy. Treat it as a one-way export. (See P2 outbox proposal below.)

L1 is the cheapest and likely sufficient.

### 3.4 Form data durability — **The user's explicit ask, and the gap is real**

#### 3.4.1 What we have today

- **Primary store**: `statements/{qid}/joinFormSubmissions/{uid}` — Firestore, persistent, full payload (name, phone, email, custom fields).
- **Audit (1)**: `joinRegistrationBackups` doc per submission write — captures `before`/`after` of the entire submission doc. **This DOES contain form data.** ✓
- **Audit (2)**: `joinRegistrationBackups` doc per membership add/remove — captures only `uid + displayName + optionId + role`. **No phone/email/custom fields.** ✗
- **Retention**: 7 days TTL on both audit shapes.

#### 3.4.2 The actual gap

If `joinFormSubmissions` were corrupted/wiped today:
- For a user who **submitted within the last 7 days**, audit (1) holds their full payload. Recoverable.
- For a user who **submitted >7 days ago and joined an option in the last 7 days**, audit (1) is gone, audit (2) only has `displayName`. **Phone/email lost.**
- For a user who **submitted >7 days ago and didn't touch anything since**, both audits are gone. **Total loss.**

The user is right: the audit is a debugging aid, not a backup.

#### 3.4.3 Proposed fix (P0)

Two-tier durability:

```
                ┌─────────────────────────────┐
                │ joinFormSubmissions/{uid}    │  hot path, mutable
                │ (current submission state)   │
                └─────────────┬────────────────┘
                              │ on every write
                              ▼
                ┌─────────────────────────────┐
                │ joinFormSubmissionsHistory  │  immutable, retained N days
                │   /{questionId}_{userId}_   │  one doc per write event
                │   {ms-timestamp}             │  full snapshot incl. PII
                └─────────────┬────────────────┘
                              │ retention via batched archival job
                              ▼  (optional, future)
                ┌─────────────────────────────┐
                │ GCS bucket (cold backup)    │  encrypted at rest, infrequent access
                │ join-form-archive/{qid}/    │
                │   {uid}/{ms}.json.enc       │
                └─────────────────────────────┘
```

**Concrete schema for `joinFormSubmissionsHistory/{historyDocId}`:**

```ts
interface JoinFormSubmissionHistoryEntry {
  // identity
  historyId: string;          // {questionId}_{userId}_{capturedAtMs}
  questionId: string;
  userId: string;

  // operation
  operation: 'create' | 'update' | 'delete';  // 'delete' captures the last-known state right before deletion
  capturedAt: number;         // ms
  capturedByTrigger: string;  // 'fn_backupJoinFormSubmission' for provenance

  // payload — full snapshot, NEVER stripped
  displayName: string;
  values: Record<string, string>;   // full custom-field bag (name, phone, email, ...)
  role: 'activist' | 'organizer' | null;

  // for restoration ergonomics — what was their membership at capture time?
  membershipSnapshot?: {
    activistOptions: string[];      // option ids
    organizerOptions: string[];     // option ids
  };

  // optionally retained for compliance disposal
  retentionPolicy: 'standard' | 'gdpr-erasure-pending';

  expireAt: Timestamp;        // native Firestore Timestamp (TTL requirement)
}
```

**Doc id is `{questionId}_{userId}_{capturedAtMs}`** — deterministic, sortable, one query per user gets the full timeline.

**Retention.**
- **Hot tier** (Firestore): 90 days TTL on `expireAt` (per user policy decision). Long enough to cover an end-of-quarter restoration, a legal hold notice, or a user's GDPR request, while staying aligned with Israeli Privacy Law's data-minimization principle.
- **Cold tier** (optional, future): nightly job archives expired entries to GCS as encrypted JSON, keyed by `{qid}/{uid}/{ms}.json.enc`. Encryption: customer-managed KMS key, separate IAM principal from the runtime functions. Off by default — enable per-tenant when product confirms it's wanted.
- The TTL'd `joinRegistrationBackups` collection **stays as-is** for the membership-event audit. Two collections, two purposes:
  - `joinRegistrationBackups`: 7-day "what just happened" trace.
  - `joinFormSubmissionsHistory`: 90-day "user's actual data" record.

**Privacy (Israeli Privacy Protection Law, Amendment 13).**
- Every `JoinFormSubmissionHistoryEntry` is treated as a personal data record. Phone numbers + custom fields trip the "sensitive personal info" definition when combined with identification.
- **Access control**: Firestore rule `allow read, write: if false` for clients (admin SDK only). Same default-deny posture as `joinRegistrationBackups` today.
- **Erasure**: a callable `fn_eraseJoinFormHistoryForUser(uid, scope)` that replaces every history doc's `values`/`displayName` fields with `{redactedAt: ms}` in place. Doc ids stay stable (audit trail of *that an erasure happened*) but PII is gone. Required by law for user-initiated erasure requests. **Schema is forward-compatible** (`retentionPolicy` field exists) — callable ships when legal team requests it.
- **Logging**: each history write logged with operation + userId + questionId via `logError`/`logInfo` so SREs have a paper trail without dumping the bodies.
- **No log bodies**: never `logger.info(submission.values)` — phone numbers must not land in Cloud Logging.

**Restoration runbook (the ergonomics test).**
1. Operator runs `npx tsx scripts/restoreJoinFormSubmissions.ts --question-id Q --as-of 2026-04-15T00:00:00Z`.
2. Script queries `joinFormSubmissionsHistory` where `questionId == Q && capturedAt <= asOfMs`, group by userId, take latest per user.
3. Writes each as `joinFormSubmissions/{uid}` with `{merge: false}` (full overwrite — restoration intent is deliberate).
4. Optionally re-fires `fn_reconcileJoinSheet` to push to the sheet.

This is what the user means by "could you restore the full form data per user." Today, you can — for users who happened to write in the last 7 days. The fix makes it 90 days and decouples it from membership churn.

#### 3.4.4 Implementation effort

`fn_backupJoinFormSubmission` already does most of the work — it captures the full doc on every write. The change is:
- Switch its target from `joinRegistrationBackups` to `joinFormSubmissionsHistory`.
- Use a deterministic doc id (`{qid}_{uid}_{ms}`) instead of `add()`.
- Set TTL to 90 days.
- Add `operation` and `capturedByTrigger` fields.
- Add the membership snapshot (cheap read of the option arrays where this user appears).

**Half a day of code, plus rules + TTL deploy. Existing audit data stays in `joinRegistrationBackups` and ages out naturally.**

### 3.5 Idempotency — **Mostly hardened, two gaps**

**Strengths.**
- Append: `findRowIndex` guard before `appendUserRow` (`fn_syncOptionMembersToSheet.ts:351-368`). Strict `(userId, optionId, role)` match.
- Remove: `findRowIndex` requires affirmative option match (`:518-558`). Refuses to delete when neither column is present. The right call.
- Reconcile: same guard + same append path. Re-running it is safe.
- `resolveJoinIntents`: protected by `phase === 'resolved'` check (`fn_resolveJoinIntents.ts:81`). Second call throws `failed-precondition`.

**Weaknesses.**
1. `resetQuestionJoining` (`store.ts:2059-2161`) is **not idempotent across partial failures**. If step 1 (clear options) succeeds and step 4 (delete submissions) fails, a retry repeats step 1 (no-op) but step 3 (sheet wipe) does N callable calls per remaining submission, each of which iterates the sheet. On a question with 200 submissions and a transient rules deny, retry cost is ~200 sheet API hits × 2.

   **Fix**: track operation progress via a marker doc (e.g. `statements/{qid}/_resetState/{ms}`) so a retry skips already-completed steps.
2. The trigger relies on being **single-flighted by Firestore** (one delivery per write). In normal operation that holds. But Firestore *does* re-deliver on retry, and the `findRowIndex` check is not transactional — between the find and the append, another delivery could append the same row. **Window**: small but nonzero. **Mitigation**: deterministic row id is impossible in Sheets, but we could use `appendCells` with `valueInputOption: USER_ENTERED` + a synthesized row hash in a hidden column and `findRowIndex` matching on that hash. Or accept the edge and rely on reconcile to deduplicate. **Recommendation**: accept and document, until duplication actually shows up.

**Risk.** #1 is a real but bounded issue (only triggered by an admin's bad day). #2 is theoretical.

### 3.6 Auth/authorization consistency — **Three copies of the same check**

The "creator OR admin sub OR delegate" check appears in three places:

- `fn_createOrganizerSuggestion.ts:62-86` — creator + sub + delegate (with `canManageOrganizerSolutions`).
- `fn_reconcileJoinSheet.ts:77-104` — creator + sub + delegate (same predicate).
- `fn_createJoinDelegateInvite.ts` — only creator + sub. **No delegate path** (intentional? — delegates can't add more delegates; this is correct, but it should be commented as a deliberate omission).
- `fn_resolveJoinIntents.ts:60-67` — only sub-based admin check, **no creator fallback, no delegate**. Means the question's creator can be locked out of resolving intents on their own question if their subscription somehow is missing. **Inconsistent with all the others.**

**Fix (P0).** Extract a shared helper in `functions/src/utils/joinAuth.ts`:

```ts
export interface JoinAdminAuthOptions {
  uid: string;
  questionId: string;
  /** When true, also allow JoinDelegates with canManageOrganizerSolutions. */
  allowDelegate?: boolean;
  /** When provided, the function name for logging. */
  operation?: string;
}

export async function assertJoinAdminAuthorized(
  opts: JoinAdminAuthOptions,
): Promise<{ via: 'creator' | 'subscription' | 'delegate' }> {
  // ... single implementation, well-tested, returns the auth path used
  //     so callers can log it for forensics.
}
```

Each callable shrinks from ~30 lines of auth to one call. The intentional omissions (e.g. delegates can't invite delegates) become explicit options on the helper rather than copy-paste differences.

**Note on `fn_resolveJoinIntents`.** Whether this should accept creator + delegate is a product question — see §6.

### 3.7 Caching & race conditions — **The cross-tab gap is real**

**Strengths.** The single-tab flow is well thought through:
- `joinFormSubmittedRole` populated on save and on first fetch (`store.ts:1942`).
- Cache keys consistent: `${questionId}_${userId}` everywhere.
- Reset clears matching keys (`store.ts:2155-2158`).

**Weaknesses.**
1. **Two open tabs, same user, same question.** Tab A fills the form and joins. Tab B's cache still says `joinFormSubmittedRole === null`. Tab B clicks join → opens the form again. User fills it again, overwriting Tab A's submission. Survivable (data is the same person), but jarring and produces duplicate sheet operations.
2. **Admin reset, user has page open.** Admin runs `resetQuestionJoining` from another browser. The user's tab still has `joinFormSubmittedRole` populated from earlier. Their next join click skips the form modal, calls `toggleJoining`, the option write triggers `fn_syncOptionMembersToSheet`, which calls `appendUserRow`, which finds **no submission** and returns `'skipped-no-submission'`. **Result**: user appears in the option's `joined` array but has no sheet row and no submission record. **This is the worst kind of silent failure** — the UI shows them as joined.
3. **The form-skip cache is the load-bearing UX optimization.** If we invalidated it correctly, we'd need a Firestore listener on the user's own submission doc. That listener already exists conceptually — `getJoinFormSubmissionData` fetches once and caches. **Fix**: add an `onSnapshot` to `joinFormSubmissions/{uid}` for the active question. One read-listener per question, automatically corrects the cache on remote deletes.

**Risk.** #2 is the highest-priority race. **Fix is small** (one listener) and **mitigates a known production scenario** (admin reset is a documented feature). I'd put it on the P1 list.

### 3.8 Observability — **Insufficient**

- 33 `console.error` / `logger.error` calls across the join functions, **none** using the project's `logError` util (`functions/src/utils/errorHandling.ts`). Means errors are unstructured strings, not categorized error types, no consistent operation tag.
- No counters / metrics. Sheet quota use, append latency, reconcile throughput — all invisible until something breaks.
- Operator workflow today: gcloud log search for "[fn_syncOptionMembersToSheet]" prefix. Workable for one-off debugging, useless for trends.

**Proposed (P1 + P2):**
- **P1** — replace `logger.error` with `logError(error, { operation: 'joinForm.syncOptionMembersToSheet', questionId, optionId, userId, role })`. Adopt the project standard. Cheap.
- **P2** — emit structured trace events: `appendStart` / `appendOk` / `appendSkipped` / `appendError` with the same context. Build a Cloud Logging metric on those, plumb to a single Looker Studio "Join Health" dashboard. One panel each: trigger latency, append rate, reconcile success rate, backup write rate, error rate by sub-operation.
- **P2** — alerting on `appendError` rate > 1% over 5min, or `skipped-no-submission` rate > 5% (which catches the cross-tab cache bug above as a *sustained signal*).

### 3.9 Testing — **Zero coverage**

No tests for any of:
- `fn_syncOptionMembersToSheet` (the trigger)
- `fn_backupJoinRegistration` (both backups)
- `fn_reconcileJoinSheet`
- `fn_removeUserFromSheet`
- `fn_createOrganizerSuggestion`
- `fn_resolveJoinIntents`
- `apps/join/src/lib/store.ts` (in particular `toggleJoining`, `saveJoinFormSubmission`, `resetQuestionJoining`)

The `__tests__` directory in the join app exists and tests `facilitator.ts`, `formatText.ts`, `linkify.ts`. The functions side has tests for synthesis, condensation, errorHandling — none for join.

**The three recent bugs were all in functions that have no tests.** That's not a coincidence.

**Proposed minimum (P1):**
1. **Pure-function tests** — no Firestore, no Sheets, just inputs/outputs:
   - `diffMembers` — added/removed for empty/identical/disjoint/overlapping arrays.
   - `findRowIndex` — given a fixture sheet (raw 2D string array), find the right row for various (uid, optionId, role) tuples; verify all the affirmative-match guards.
   - `buildRowFromHeader` — legacy 9-col, new 10-col, header with extra columns, header with missing columns.
   - `computeMembershipEvents` — joined add, joined remove, organizer add, role swap.
2. **Cap-swap logic in `toggleJoining`** — fixture transactions, verify the user is removed from `releaseFromOptionId` and added to the new option in one transaction.
3. **`handleJoin` decision tree** — given `(joinForm enabled, cachedRole, cap, alreadyJoined)`, does it call form modal / cap modal / direct toggle?

These are doable in a day if we extract the pure helpers from the trigger into a `joinSheetMath.ts` module that has no Firestore imports.

### 3.10 File organization — **`store.ts` is doing too much**

2323 lines. The comments are good — I can navigate it — but the file conflates concerns that have independent lifecycles.

**Concrete decomposition:**

```
apps/join/src/lib/
├── store.ts               # public re-exports + the residual question/options state (≤300 lines)
├── join/
│   ├── toggleJoining.ts   # the transaction (~150 lines)
│   ├── joinFormCache.ts   # the two caches + onSnapshot listener (~120 lines)
│   ├── joinFormApi.ts     # save / has / get / getRole (~80 lines)
│   ├── resetJoining.ts    # admin reset (~120 lines)
│   └── sheetCallables.ts  # fn_removeUserFromSheet wrapper, fn_reconcileJoinSheet wrapper (~60 lines)
├── chat/
│   ├── messageCounts.ts   # counts + lastReadMap (~150 lines)
│   └── ...
├── delegates/
│   ├── delegateSubscriptions.ts
│   └── delegateActions.ts
├── newSolutionsBuffer.ts  # the highlight buffer logic (~120 lines)
└── userEvaluations.ts     # optimistic + confirmed evaluations (~120 lines)
```

Each module gets its own `__tests__/` neighbor. The "store" becomes a thin re-export and the dependency direction becomes legible (modules depend on `firebase.ts` + `user.ts` + each other through public APIs, not on `store.ts`'s internal state).

**This is bigger work — a full day — and worth doing once but not urgent.** P1.

---

## 4. Target architecture (concrete proposals for the P0 items)

### 4.1 Form data backup

(Detailed in §3.4. Summary of what changes.)

**New collection**: `joinFormSubmissionsHistory` with deterministic ids `{qid}_{uid}_{ms}` and 90-day TTL.

**Trigger change** — `fn_backupJoinFormSubmission` now writes:
```ts
const historyId = `${questionId}_${userId}_${capturedAt}`;
await db.collection('joinFormSubmissionsHistory').doc(historyId).set({
  historyId,
  questionId,
  userId,
  operation: !before ? 'create' : !after ? 'delete' : 'update',
  capturedAt,
  capturedByTrigger: 'fn_backupJoinFormSubmission',
  displayName: (after?.displayName ?? before?.displayName) ?? '',
  values: (after?.values ?? before?.values) ?? {},
  role: (after?.role ?? before?.role) ?? null,
  membershipSnapshot: await readUserMembership(questionId, userId),
  retentionPolicy: 'standard',
  expireAt: Timestamp.fromMillis(Date.now() + 90 * DAY_MS),
});
```

The existing `fn_backupOptionMembership` stays exactly as-is — it serves a different purpose (per-event trace) and 7d is correct for a debugging trail.

**Firestore rules** — same `allow read, write: if false` default-deny posture.

**Restoration script** — `functions/scripts/restoreJoinFormSubmissions.ts`. Read-only by default; `--apply` flag to actually write.

**Erasure callable** — `fn_eraseJoinFormHistoryForUser` for the GDPR/Israeli-PII delete path. Out of scope for this milestone if not legally required yet, but design the schema with `redactedAt` from day one.

### 4.2 Shared join admin auth

`functions/src/utils/joinAuth.ts`:

```ts
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../db';
import { Collections, JoinDelegate, Role, Statement, getJoinDelegateId } from '@freedi/shared-types';
import { logError } from './errorHandling';

export type JoinAuthSource = 'creator' | 'subscription' | 'delegate';

export interface JoinAdminAuthOptions {
  uid: string;
  questionId: string;
  /** Allow a JoinDelegate as a valid path. Default true. Set false on
   *  operations that must NOT be exercised by delegates (e.g. "invite another
   *  delegate" — would be a privilege-escalation surface). */
  allowDelegate?: boolean;
  /** Permission key required on the delegate doc. Default canManageOrganizerSolutions. */
  delegatePermission?: 'canManageOrganizerSolutions' | 'canManageParticipantSolutions';
  /** Operation tag for structured logs. */
  operation: string;
}

export async function assertJoinAdminAuthorized(
  opts: JoinAdminAuthOptions,
): Promise<{ via: JoinAuthSource; question: Statement }> {
  const { uid, questionId, allowDelegate = true, delegatePermission = 'canManageOrganizerSolutions', operation } = opts;

  const qSnap = await db.collection(Collections.statements).doc(questionId).get();
  if (!qSnap.exists) throw new HttpsError('not-found', 'Question not found');
  const question = qSnap.data() as Statement;

  if (question.creatorId === uid) {
    return { via: 'creator', question };
  }

  const subSnap = await db
    .collection(Collections.statementsSubscribe)
    .doc(`${uid}--${questionId}`)
    .get();
  if (subSnap.exists) {
    const role = subSnap.data()?.role;
    if (role === Role.admin || role === Role.creator) {
      return { via: 'subscription', question };
    }
  }

  if (allowDelegate) {
    const delegateSnap = await db
      .collection(Collections.joinDelegates)
      .doc(getJoinDelegateId(questionId, uid))
      .get();
    if (delegateSnap.exists) {
      const delegate = delegateSnap.data() as JoinDelegate;
      if (delegate.permissions?.[delegatePermission]) {
        return { via: 'delegate', question };
      }
    }
  }

  logError(new Error('join admin authorization denied'), {
    operation,
    userId: uid,
    statementId: questionId,
  });
  throw new HttpsError('permission-denied', 'You are not authorized for this question');
}
```

**Caller diff (e.g. `fn_reconcileJoinSheet`):**
```ts
// before — 27 lines of auth
// after:
const { question } = await assertJoinAdminAuthorized({
  uid,
  questionId,
  operation: 'joinForm.reconcileSheet',
});
```

This also fixes the inconsistency in `fn_resolveJoinIntents` — it picks up creator + delegate paths for free if we want, or pass `allowDelegate: false` to keep delegates out (a product call — see §6).

### 4.3 Sheet schema versioning

Add a hidden version cell at `Z1`:

```ts
const CURRENT_SHEET_SCHEMA_VERSION = 2;  // 2 = with optionId column, 1 = without

async function readSheetSchemaVersion(sheets, sheetId): Promise<number> {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId, range: 'Z1',
  });
  const cell = resp.data.values?.[0]?.[0];
  if (typeof cell !== 'string') return 1;  // assume legacy
  const parsed = Number(cell.replace(/^v/, ''));
  return Number.isFinite(parsed) ? parsed : 1;
}

async function ensureSchemaVersionMatches(sheets, sheetId): Promise<void> {
  const v = await readSheetSchemaVersion(sheets, sheetId);
  if (v > CURRENT_SHEET_SCHEMA_VERSION) {
    throw new Error(
      `Sheet schema v${v} is newer than this trigger supports (v${CURRENT_SHEET_SCHEMA_VERSION}). ` +
      `Refusing to write to avoid data corruption.`,
    );
  }
  if (v < CURRENT_SHEET_SCHEMA_VERSION) {
    // Optional: auto-migrate by appending the missing columns + writing v2 marker.
    // For now, log a warning; reconciliation will still work because buildRowFromHeader
    // adapts to the live header.
    logger.warn('[joinSheet] sheet predates current schema', {
      sheetId, currentVersion: v, expectedVersion: CURRENT_SHEET_SCHEMA_VERSION,
    });
  }
}
```

`ensureHeaderRow` writes `v${CURRENT_SHEET_SCHEMA_VERSION}` to `Z1` when initializing a fresh sheet. Old sheets keep working (warning only). The corruption surface — silently accepting an unknown future schema — is closed.

---

## 5. Roadmap

(Already in the TL;DR. Each item below has a one-sentence sketch so the user can pick.)

### P0 — must ship before next user-visible bug

1. **Form-data history collection.** §4.1. Half a day. Unblocks the user's "preserve user form details" requirement.
2. **`assertJoinAdminAuthorized` helper.** §4.2. Two hours. Reduces three callables × 30 lines of auth to one call. Reveals the `fn_resolveJoinIntents` inconsistency (which the user can then decide on).
3. **Sheet schema version cell.** §4.3. Three hours. Makes the next column addition safe.

### P1 — visible but not blocking

4. **Decompose `apps/join/src/lib/store.ts`.** §3.10. One day. Per-domain modules, each with own tests.
5. **Replace 33 `console.error` with `logError`.** Two hours. Adopts the project standard the rest of `functions/src` already uses.
6. **Pure-function test harness for trigger math.** One day. `diffMembers`, `findRowIndex`, `buildRowFromHeader`, `computeMembershipEvents`. The three recent bugs would all have been caught.
7. **Cross-tab cache invalidation via onSnapshot.** Two hours. Closes the "admin reset while user has tab open" silent-failure scenario.

### P2 — nice to have

8. **Sheet sync as a durable outbox.** Move from "trigger writes to sheet directly" to "trigger writes to `joinSheetOutbox/{ms}_{op}` Firestore doc; a separate worker function consumes them with retry+backoff." Decouples Sheets API availability from our membership write path. ~2-3 days.
9. **Observability dashboard.** §3.8. One day for the Looker Studio + alert.
10. **`docs/architecture/JOIN_DATAFLOW.md`.** Two hours. Capture the diagrams + invariants from §1-2 in living docs.

---

## 6. Open questions (resolved during plan approval)

| # | Question | Decision (2026-05-10) |
|---|----------|----------------------|
| 1 | Sheet still optional, or Firestore-only acceptable? | Open — sheet remains primary destination for admins. P2 outbox proposal stays. |
| 2 | Should `fn_resolveJoinIntents` accept delegates? | YES — accept creator + sub + delegate via the new shared helper (default `allowDelegate: true`). |
| 3 | Form-data retention — 180 days? | Reduced to **90 days** (data-minimization aligned). |
| 4 | Sheet schema version — `Z1` cell or parallel `__meta` tab? | `Z1` cell (least surface). |
| 5 | Cap (`maxJoinsPerUser`) is client-side only — gap or intentional? | **Server-enforce in this milestone** via new `fn_joinOption` callable + tightened firestore.rules. |
| 6 | Anonymous users + join forms — require sign-in? | Open — accept current behavior, revisit when product asks. |

---

## Appendix A — Files cited (for the user's reference)

- `functions/src/engagement/joinForm/fn_syncOptionMembersToSheet.ts` (564 lines) — the trigger
- `functions/src/engagement/joinForm/fn_backupJoinRegistration.ts` (195 lines) — both backups
- `functions/src/engagement/joinForm/fn_reconcileJoinSheet.ts` (215 lines) — admin backfill
- `functions/src/engagement/joinForm/fn_removeUserFromSheet.ts` (215 lines) — admin reset only
- `functions/src/engagement/joinForm/fn_createOrganizerSuggestion.ts` (126 lines) — auth shape #1
- `functions/src/engagement/joinForm/fn_resolveJoinIntents.ts` (203 lines) — auth shape #2 (inconsistent)
- `functions/src/engagement/joinDelegate/fn_createJoinDelegateInvite.ts` (deliberately no delegate path)
- `functions/src/engagement/joinForm/getGoogleSheetsClient.ts` — service account factory
- `functions/scripts/reconcileJoinSheet.ts`, `dumpSheetForDebug.ts` — operational scripts
- `apps/join/src/lib/store.ts` (2323 lines) — Mithril state
- `apps/join/src/components/JoinFormModal.ts` (175 lines)
- `apps/join/src/components/LimitReachedModal.ts` (156 lines)
- `apps/join/src/components/SolutionCard.ts` (911 lines, `handleJoin` at :709)
- `packages/shared-types/src/models/statement/JoinFormSubmission.ts`
- `packages/shared-types/src/models/statement/StatementSettings.ts:206-207` (joinForm/joinResolution config)
- `packages/shared-types/src/models/joinDelegate/JoinDelegate.ts`
- `firestore.rules:188-236` (submissions + resolutionUsers), `:920-966` (delegates)
- `functions/src/utils/errorHandling.ts:73` — the `logError` util the join code is not yet using

---

End of memo.
