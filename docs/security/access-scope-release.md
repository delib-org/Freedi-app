# Releasing private-level reads (`accessScope`)

Release steps for the `fix/private-statement-reads` branch. Each statement gets an
`accessScope`. The rules then refuse any list that does not name it. The order
matters: shipping the rules too early hides content from people who should see
it, and shipping them late leaves private content readable.

Production is `wizcol-app` (not the `.firebaserc` alias `prod`). Rehearse every
step on `freedi-test` first.

## 1. Indexes

```bash
firebase deploy --only firestore:indexes --project <project-id>
```

Never use `--force` with indexes: it deletes production indexes that are not in
the file. Wait until every new index shows READY in the console.

## 2. Functions, before the backfill and the rules

These need the new code before anything else:
- the stamping triggers: `onStatementCreated` stamps and checks reused ids;
  `liveSynthOnOptionUpdate` re-stamps on a move or an access change;
- `onStatementDeletionTombstone`;
- `onAccessScopeJobWritten`;
- `getBulkStatements` and every callable that judges access.

An older `scopeOf` resolves a loop of parents to `'open'`, and an older create
trigger does not check a reused id. So functions go out before the backfill and
before the rules.

**`onAccessScopeJobWritten` has a failure policy (`retry: true`).** Its first
deploy is refused unless it carries `--force`. Keep `--only`, so `--force`
touches nothing else:

```bash
npm run deploy:fn:<target> -- functions:onAccessScopeJobWritten --force
```

**The statement dispatcher cutover is live.** Production passed T on
2026-11-11. The 14 functions in `scripts/scale/dispatchCutover.config.json` must
keep holding T (`STATEMENT_DISPATCH_CUTOVER_MS` stays set in `env/.env.<target>`).
The cutover script's preflight refuses once T has passed, so it cannot be used
to check them now. After any deploy that includes them, check each of the 14
yourself:

```bash
gcloud functions describe <name> --region=me-west1 --project=<project-id> \
  --format='value(state,serviceConfig.environmentVariables.STATEMENT_DISPATCH_CUTOVER_MS)'
```

Each must be `ACTIVE` and show T.

## 3. Backfill, at a rate the triggers can take

Every statement write starts about 19 statement triggers.
- Most return at once on a write that changes only `accessScope`.
- But each cold instance loads the whole functions bundle, and the 256 MiB
  triggers run close to their limit while doing it.
- On `freedi-test`, the old default of 50 writes per second (about 950 trigger
  starts per second) ran out of memory about 235 times.

**Use `--rate=5`, now the default:**
- about 95 trigger starts per second, a tenth of what failed;
- in line with ordinary daytime traffic.

Start with a pilot, then check the logs:

```bash
GCLOUD_PROJECT=<project-id> npx tsx scripts/backfillAccessScope.ts --execute --confirm-prod --rate=5 --limit=500
gcloud logging read 'textPayload:"Memory limit" OR jsonPayload.message:"Memory limit"' \
  --project=<project-id> --freshness=30m --limit=50
```

- If the pilot shows **no** memory errors, run the rest. It resumes from where
  the pilot stopped.
- If it shows any, run the rest at `--rate=2`.

```bash
GCLOUD_PROJECT=<project-id> npx tsx scripts/backfillAccessScope.ts --execute --confirm-prod --rate=5
```

**Expected duration:** the number of statements to write, divided by 5, in
seconds. Use the first dry run's `toWrite` count. On `freedi-test` all 2,472
statements were written.

| `toWrite` | at 5/s | at 2/s |
|---|---|---|
| 10,000 | 34 min | 84 min |
| 50,000 | 2 h 47 min | 7 h |
| 100,000 | 5 h 34 min | 14 h |

The run is resumable. A long run can be split across quiet hours with `--limit`.

Then:
1. A dry run must report `toWrite: 0`.
2. Review `pocketsToReview`.
3. If the run quarantined anything, review it: see
   [access-scope-quarantine.md](access-scope-quarantine.md).

## 4. Clients

Deploy every app built from this branch:
- main app, Join, join-class, Sign, Studio, Chat, Agora, Odyssey, Flow, Tables,
  Admin;
- MC and Sign go through their `main-mc` and `main-sign` branches (Vercel).

Every client query on `statements` on this branch either names `accessScope`
or uses a shape the rules accept without it (by id, own statements, the leaf
children of one parent, a level the caller hosts, an organization). Notes:
- Studio's `useChildren`, `useChildrenOfParents` and EventDashboard list
  children by parent alone. They pass only for a host of that parent. Studio's
  users hold admin subscriptions on their organization's questions, so they do.
- The Admin app's whole-collection queries pass only for system admins.

## 5. Wait for old main-app tabs and installed apps

A main-app tab, or an installed app, that was opened before step 4 keeps
running the old code until it reloads.
- The service worker takes over at once, but the page in front of the user does
  not reload.
- After the rules ship, these old screens fail for anyone who is not a host of
  the statement (the old queries do not name `accessScope`; checked on the
  emulator against the new rules):

| Old screen | Old query, now refused |
|---|---|
| A question's discussion and chat feed, the answer chat sheet, comments on a suggestion | children by `parentId` with `statementType in [...]` including questions |
| "Load older" in chat and the lazy option list | children by `parentId` alone |
| Views that load a whole subtree (`listenToTreeDescendants`, `listenToTreeByTopParent`, `listenToDescendants`) | `parents array-contains` or `topParentId ==` with no scope |
| The mind map (all modes) | `parents array-contains` (refused even for hosts) |
| Results and top options on the map | children by `parentId` alone |
| "Load all" banner, statement search, delta listeners | count and deltas by `parentId` / `parents` |
| Deleting one's own statement that has children (non-hosts) | lists the children by `parentId` alone |

Still working on old clients:
- opening a statement by id;
- Home (the person's own subscriptions);
- leaf lists (options, paragraphs, official paragraphs, clusters);
- everything a host of the statement does.

Old open tabs of Join and join-class fail the same way on their lists of
questions under a lesson or main question. They were changed on this branch
too.

Ship the rules only once most sessions run the new build: check the release in
Sentry or analytics, and give it at least a few days. Asking users to reload is
a fallback.

## 6. Rules, last

```bash
firebase deploy --only firestore:rules --project <project-id>
```

Rules deploys replace the whole file. Deploy from a clean worktree at the
release commit.

What changes for people:
- Only a person's own subscriptions, those of people in the same statement, or
  those a host or system admin can see are readable.
- Ratings and votes inside a private level need a way into it.
- Six legacy per-statement collections close: `agrees`, `importance`,
  `statementSegments`, `statementsSignatures`, `statementRoomsAsked` and
  `statementEvaluators`.
- `statementsMeta` and `approval` take no client writes.
- `statementViews` is the person's own.
- See the review notes on the branch for the full list.

## Afterwards

**Deferred:** ratings stay readable by anyone signed in (the `evaluations`
read rule, kept open for Odyssey's opinion map and Agora's timeline). Ratings
inside a private level, including who gave them, can be read by people outside
it. Closing this needs evaluation reads that name the scope, or a
server-side read path for Odyssey and Agora.

- Quarantined statements: [access-scope-quarantine.md](access-scope-quarantine.md),
  `scripts/liftQuarantine.ts`.
- Watch Sentry for `accessScope.scopeOf` and `accessScope.scopeOfReusedId`.
  Each one is a forged or reused place, and a person should look at it.
