# Agora — working rules

A 45-minute classroom deliberation game. Mithril + Vite, Hebrew-first RTL, port
3009. Live at https://agora-wizcol.web.app (project `wizcol-app`).

The root `CLAUDE.md` applies except where this file says otherwise. Read
`docs/HANDOFF.md` before changing anything — it holds the gotchas that cost
real time.

## Before you edit

```bash
npm run preflight   # asserts emulators + seed + vite, and seeds if missing
npm run fast        # a session already at any stage, in ~4s
```

Run these **before** touching anything, not after. A change you cannot see is
a change you cannot judge.

## Where things go

```
views/            route and stage targets: render, and dispatch
components/       props in, vnodes out. No Firestore, no storage
lib/flows/        state machines with injected deps — tested in node
lib/              state modules, domain rules, i18n
lib/teacher.ts    teacher + join screens' Firestore calls
lib/proposals.ts  the student square's listeners and writes
lib/session.ts    the single session+participants listener
lib/voting.ts     the ballot
shared-types      schemas and ALL maths both the client and functions use
```

Firestore also lives in `lib/notifications.ts`, `seenState.ts`,
`digestPrefs.ts`, `topic.ts`, `values.ts` — and nowhere outside `lib/`.
Writes a student's points or standing depend on (votes, proposals,
suggestions, teacher saves) go through `lib/confirmedWrite.ts`; the rest
(seen-markers, digest prefs, notice fan-out) are fire-and-forget by design —
losing one costs a re-render, not a payout.

Rules of the road, each learned from something that broke:

- **A component never imports firebase.** `RateScale` did, and the app's most
  important write lived inside a widget.
- **Every number a student sees is server-written or computed by a shared-types
  function.** The client and the trigger once counted the class differently, so
  the projector and the phones disagreed about the same proposal.
- **Every write goes through `lib/`, and returns something the caller can
  believe.** Firestore answers from cache and queues silently: a write that
  never lands never rejects either. Use `lib/confirmedWrite.ts` — the only
  honest signal is a clock.
- **Rules before conventions.** If something must never happen, express it in a
  type or a security rule, not a comment.
- **No `any`.** Enforced. Unknown Firestore payloads are `Record<string,
  unknown>` and go through valibot.

## Styles

`src/styles/components/` — twelve partials, imported by `components.scss`. BEM,
tokens only, no hardcoded colours. **Not** CSS modules and not the root atomic
system: Mithril has no pipeline for either, and the single global import in
`index.ts` is deliberate.

`mock/surfaces.html` is the contrast gauntlet — it imports the real
stylesheets, so a stylesheet you delete must be removed from there too.

Looks: every colour is a token on `:root`, and a look is one override block
keyed on `data-session-theme` (`_theme-candy-block`, `_theme-custom-block`,
`_theme-civic-block`). `lib/theme.ts` paints the attribute; `lib/looks.ts`
is the student's picks and builds; shared-types `agoraTheme.ts` decides who
wins. Add a saturated surface to the on-dark registry in `tokens.scss` AND to
the `.on-light` islands in each look block. `npx tsx scripts/e2e-looks.mjs`
walks pick → build → borrow → teacher re-dress through the real rules.

## Verifying

```bash
npm run check-all              # lint, typecheck, tests, build, contrast, type audit
node scripts/e2e-cycle.mjs     # the whole improvement loop, asserting POINTS in Firestore
node scripts/e2e-changes.mjs   # NEW/EDITED/IMPROVED chips and seen-state
node scripts/e2e-stuck-write.mjs  # a write that never reaches the server
npx tsx scripts/e2e-pen.mjs    # the answer box empties between questions
npx tsx scripts/load-smoke.ts  # 30 students rating at once
```

The e2e scripts assert Firestore state, not pixels. That is the point: a
screenshot proves a screen rendered, not that a student was paid.

All five e2e scripts pass. `e2e-milestones.mjs` used to fail at a different
line each run: the milestone detector treats a proposal's first sighting on the
board as silent ("arriving is not a climb") and records the baseline rank, so on
a fast emulator every rating landed before the first scores snapshot and there
was no climb left to report. The app was right; the test was racing it. It now
waits for the baseline to exist and to be below the top before forcing the
climb.

## Deploying

```bash
npm run deploy:agora                        # hosting (from the repo root)
npm run deploy:f:prod -- agoraCreateSession  # functions, named explicitly
```

Three things bite:

1. **Indexes are not deployed by any script.** `deploy:rules:prod` covers rules
   and storage only, and a plain index deploy would prune the server-only
   indexes other apps depend on. Create them one at a time with `gcloud` — see
   HANDOFF.
2. **`.firebaserc` is gitignored.** Copy `.firebaserc.example`. The `agora`
   target maps to site `agora-wizcol` — the words are the other way round from
   what you would guess.
3. **A new origin needs two allowlists**: Firebase Auth authorised domains, and
   the Google Cloud API key's HTTP referrers. Missing the second fails with
   `auth/requests-from-referer-…-are-blocked`, which does not mention keys.


## Supervision and modular indicators (2026-09-22)

Dashboard indicators live in `packages/shared-charts/src/indicators/`, with
ordered registries for class, student, teacher, school and system scopes.
Change those registries to add/remove/reorder indicators; keep page components
as renderers. `resolveIndicators(scope, {hide, order})` supports per-page
presentation choices. See the registry README for translations and tests.
`consoleContexts.ts` validates aggregate payloads and adapts the callable data
for both Mithril and React. Chart geometry is pure SVG; shared SCSS owns marks.
Agora chart colours are fixed analytical tokens: do not map them to a themed
identity ramp, which changes the meaning of outcome colours.

Supervision reads go through `agoraSupervisorConsole`, with server-enforced
school/teacher scope. Never expose roster identity, PINs, account history or
class codes there. Renew authorization before using cached reports. School
teacher aggregates must be rebuilt from school-filtered lesson rows, never
return the teacher's cross-school lifetime aggregate. History is bounded at
100 teacher lessons; propagate and display the truncation warning. Self usage
is available through `agoraTeacherConsole` view `activity`.

Teacher usage samples visible, recently interacted teacher/supervisor screens.
Only elapsed milliseconds and an enumerated surface are sent; no input content
or page URLs. Heartbeat transactions cap credit across tabs and month rollover.
Keep the privacy explanation beside activity charts.

Regression checks: `scripts/e2e-supervisor.mjs`, then existing
`e2e-class-career.mjs` and `e2e-teacher-classes.mjs`. Browser fixtures/checks:
`scripts/supervise-shots.mjs` and `scripts/studio-supervise-shots.mjs` (set
`AGORA_*` hosts and `STUDIO_VITE_HOST` to the same isolated emulator suite).
The scripts create emulator-only data. `SUPERVISION_REUSE=1` reuses saved
fixture IDs without reseeding. Never run these against production.

Production deployment/backfill requires Tal's explicit request. Build functions
and commit its shared-types archive; create only the teacherId/month usage
composite index; deploy rules and the named supervision/teacher aggregation
functions before either frontend. Backfill is admin-only, paged and repeat-safe.
Its cursor includes creation time AND session ID; never simplify it to a timestamp.


## Teachers' scenario library (2026-10-14)

A scenario is an `AgoraTopicPackage`; publishing adds OPTIONAL `visibility`,
`library` (card), `stats` and (on copies) `source*` fields to the same doc.
Screens: `views/teacher/scenarioLibrary/`, state in `lib/scenarioLibrary/`,
words in `lib/scenarioLibrary/strings*.ts` (merged into `i18n.ts`), styles
`_scenario-library*.scss`. Server: `functions/src/agora/fn_agoraLibrary*.ts`.

- **Who may enter.** Since 2026-10-15 approval is explicit and a HARD gate
  (pending teachers get nothing: no lesson, class, roster or scenario). An
  approved teacher is a sys-admin, holds a `grant` on `agoraApprovedTeachers/{uid}`
  (approved access request, admin attach, or the grandfather backfill), or is
  attached to an ACTIVE school. `libraryAccess.ts#resolveApproval` is the one
  seam; `requireApprovedTeacher` gates the callables; the RULES read the
  marker's existence. Requests: `agoraRequestAccess` / `agoraManageAccess`
  (docs/ia/studio-teacher-approval.md). Fastlane's `signInTeacher` grants its
  teacher; a teacher signing in through the browser on the emulator must be
  approved (Studio, or an admin attach) before opening a lesson.
- **Private is private (2026-10-15).** `agoraTopicPackages` `get`: a PUBLIC
  scenario is open to any signed-in user; a private one (anything not public,
  never-published included) only to its author, a sys-admin, or a holder of a
  reader marker `agoraTopicReaders/{id}--{uid}`. `agoraJoinSession` leaves the
  marker for every player; `agoraTopicAccess({sessionId})` is the fallback
  `lib/topic.ts` tries once on permission-denied (seats from before markers,
  a teacher running someone else's scenario). Pass the session to
  `loadTopicPackage(id, sessionId)`. `agoraCreateSession` refuses someone
  else's private scenario (the library hands out copies). A stranger opening
  `/teach/library/:id` of a private one sees "This scenario is private".
  The seed's demo package is `visibility: 'public'` for that reason.
- **Reports reach the admins.** `onAgoraLibraryReportCreated` emails the system
  admins (usersV2 `systemAdmin`, or `AGORA_LIBRARY_REPORT_RECIPIENTS`) through
  the shared nodemailer transporter: what, why, the reporter's role, a link to
  the queue; no names. The menu's "Library admin" row carries an open-reports
  badge (`state.ts#refreshOpenReports`).
- **Translations** are cached per scenario per language in
  `agoraScenarioTranslations` (valid while the scenario's `lastUpdate` matches),
  model `WORKER_MODEL` via `callLLM`. A copy in another language is translated
  whole (cached too); ids, kinds, URLs and numbers never go through the model.
- **Never** let a client write `visibility`/`library`/`stats`/`source*` (rules
  refuse it) and never count ratings on read (`stats` moves in the rating
  transaction). A hidden scenario/review stays hidden when its owner republishes
  or re-rates: only a sys-admin lifts it (`agoraLibraryModerate`).
- **Indexes** (firestore.indexes.json; create with `gcloud`, never a plain
  deploy): `agoraTopicPackages` (visibility, library.hidden, then one of
  stats.ratingBayes / library.publishedAt / stats.copyCount, descending) and
  `agoraScenarioRatings` (scenarioId, hidden, lastUpdate descending).
- **Verify:** `scripts/e2e-scenario-library.mjs` (callables + rules, real AI
  translation) and `scripts/e2e-scenario-library-ui.mjs` (browser, screenshots
  in `output/scenario-library/`, contrast + type audits). Both need a clean
  emulator DB and `OPENAI_API_KEY` in `functions/.env`.
- **Cover (P3).** `agoraLibraryGenerateCover` paints a cover from the
  scenario's own words (never student data): scene brief via `WORKER_MODEL`,
  moderation check, then `gpt-image-1-mini` 1536x1024 medium webp
  (`COVER_IMAGE` in `libraryCover.ts`, override with `AGORA_COVER_IMAGE_MODEL`;
  about USD 0.015 an image, from published pricing, not fetched live), stored
  under `agora/{id}/library-cover-ai-*.webp`. 10 a teacher a day on the approval
  marker (`AGORA_LIBRARY.COVERS_PER_DAY`). Provider seam `libraryCoverProvider.ts`
  (stubbed in jest; `AGORA_COVER_STUB=1` on the functions emulator, no network).
- **Discussion (P4).** `agoraScenarioPosts` (flat, `scenarioId` on each post, one
  reply level): `agoraLibraryPost` (30 a day, language check, `stats.postCount`),
  `agoraLibraryHidePost` (scenario author or admin; an admin's hide is lifted
  only by an admin). Hidden posts are readable by the author (`scenarioOwnerId`
  is on the doc for that) and admins only.
- **Admin (P5).** `/teach/library/admin` (sys-admin only): open reports grouped
  by target (`agoraLibraryReport` files, `agoraLibraryResolveReport` hides or
  dismisses), everything hidden with a lift button, and tag merging
  (`agoraLibraryMergeTags`: `aliasOf` first, then scenarios re-pointed in
  batches with their counters in the same commit, so a half-done merge is just
  run again). Tag counters count what the library LISTS (public and not hidden):
  hide/unhide, publish and unpublish all keep to that.
- **Deploy order:** rules, then `agoraLibraryAccess agoraLibraryCreateTag
  agoraLibraryPublish agoraLibraryUnpublish agoraLibraryUse
  agoraLibraryTranslate agoraLibraryRate agoraLibraryModerate
  agoraLibraryGenerateCover agoraLibraryPost agoraLibraryHidePost
  agoraLibraryReport agoraLibraryResolveReport agoraLibraryMergeTags`, then
  Agora hosting, then the indexes (gcloud). Remaining: P6 polish (helpful votes,
  save for later, tightening the private-read rule).
