# WizCol Tables redesign: build map

Date: 2026-11-10. Status: ready to build; no app code written yet.
Read first: [IA spec](../../ia/shared-table-assignment.md) (objects, labels, routes, states) and [design brief](../../design/tables-design-brief.md) sections 5 to 7. The approved screens are the 18 `*.dc.html` design files; their Hebrew copy is the source for `he.ts`.

Three phases, built one after another in the one shared tree on `dev`. Each phase ends green (`npm run check-all` in `apps/tables`, functions tests, rules tests) and is committed on its own. Nothing here deploys; the deploy order at the end is for when Tal asks.

Ground rules for all phases: no `any`; types live in `@freedi/shared-types`; every UI word in `apps/tables/src/lib/locales/{he,en,ar}.ts` under `tableAssignment.`; BEM classes and tokens only; files under 300 lines where possible; `functions` sees a `shared-types` change only after the package is rebuilt and repacked.

---

## 0. The privacy split (decision 13)

Today `tableAssignmentParticipants/{sessionId_uid}` holds name, choices and position, and the rules let the host get and list it. The Position screen promises the host cannot see the answer.

**Chosen split: add a name card, keep the private record where it is.**

| Collection | Doc id | Fields | Who reads | Who writes |
|---|---|---|---|---|
| `tableAssignmentParticipants` (existing, shape unchanged) | `{sessionId}_{uid}` | `sessionId, uid, fullName, preferences, position?, chosenTableIndex?, registeredAt` | the owner only | callables |
| `tableAssignmentRoster` (new) | `{sessionId}_{uid}` | `sessionId, uid, fullName, nameKey, registeredAt, hasPreferences, chosenTableIndex?` | host; owner; any registered person once the session has `publishedRunId` or is in `direct` mode (tablemates) | callables |
| `tableAssignmentCounters` (new) | `{sessionId}` | `sessionId, registered` | anyone who may read the session | callables (`FieldValue.increment`) |

Why this direction: existing live documents need no rewrite and no field is moved, so an open participant tab, the compute and publish functions (Admin SDK, read `tableAssignmentParticipants` as today) and the `isRegisteredInTableSession` rule keep working untouched. The only thing taken away is the host's read of the private record.

What the host loses on purpose: the per-person and total "gave a position" counts before computing. The number of known positions is still in every run (`metrics.population.n`), so the preview keeps its "fewer than three answered" rule. `hasPreferences` (has this person ranked yet) stays visible; it is progress, not content.

**Backfill owed** (script, idempotent, run once per project after the new functions are live): for every `tableAssignmentParticipants` doc create the `tableAssignmentRoster` doc (`nameKey` from `fullName`, `hasPreferences = preferences.length > 0`, copy `chosenTableIndex`), and for every session set `tableAssignmentCounters/{id}.registered` to the number of its participants. Without it, hosts of sessions that are live at deploy time see zero names and an empty preview, and published participants see no tablemates.

Limits to say out loud (the promise is about the app, not the database): project owners, the Admin SDK, backups and the Firebase console can still read positions; answers given before the rules deploy were readable by that session's host until then.

---

## Phase 1: server, contract, rules (with tests)

### 1.1 Shared types

Change `packages/shared-types/src/models/collections/collectionsModel.ts`: add `tableAssignmentRoster`, `tableAssignmentCounters`, `tableAssignmentSeats` (today a string literal in two places).

Change `packages/shared-types/src/models/tableAssignment/tableAssignmentModel.ts`:
- `TableAssignmentSettingsSchema`: add `expectedParticipants: optional(integer >= 1)` and `allowReturnByName: optional(boolean())` (absent means off). Both optional, so existing session docs still parse.
- Add `TableAssignmentRosterEntrySchema`, `TableAssignmentCounterSchema` and their types.
- Add `TABLE_ASSIGNMENT_STRICTNESS = { strict: 0.15, balanced: 0.3, flexible: 0.45 }`, `TABLE_ASSIGNMENT_POSITION_STOPS = [0, 25, 50, 75, 100]`.
- Add `tableAssignmentNameKey(fullName)`: trim, collapse inner whitespace, `normalize('NFKC')`, `toLocaleLowerCase()`.

Change `packages/shared-types/src/models/tableAssignment/tableAssignmentCallables.ts` (see 1.2), `packages/shared-types/src/index.ts` (exports), `packages/shared-types/src/__tests__/tableAssignmentModel.test.ts` (old docs without the new fields parse; name key cases in Hebrew, Arabic, mixed case, double spaces).

Change `packages/table-assignment-client/src/client.ts` and its tests: add `cancelRegistration`, `fixDetails` to `TABLES_CALLABLES` and `TablesClient`.

### 1.2 Callables

New:

| Callable | Actor | Input | Output | Rules |
|---|---|---|---|---|
| `tablesCancelRegistration` | the participant (own uid, so only the browser that registered) | `{ sessionId }` | `{ cancelled: true }` | only in `registrationOpen` (else `failed-precondition`, reason `registration-closed`). Deletes the caller's private record and name card, decrements the counter, frees the direct-mode seat counter. Calling it when not registered is a no-op success |
| `tablesFixDetails` | host | `{ sessionId, title?, topics?: { topicId, title }[] }` | `{ title, topicIds }` | allowed in `registrationOpen`, `registrationClosed`, `published`. Only titles change; every `topicId` must belong to the session; adding, removing and reordering are refused. One transaction. Does not change `inputHash` (titles are not hashed), so a ready preview stays publishable |

Changed:

| Callable | Change |
|---|---|
| `tablesRegister` | Input gains `nameMatch?: 'ask' \| 'claim' \| 'separate'` (default `'ask'`). Output becomes `{ outcome: 'registered' \| 'nameExists', participant? }`. Always writes the name card; a new registration increments the counter. When the caller is not yet registered, the session has `allowReturnByName`, status is `registrationOpen` and exactly one other registration has the same `nameKey`: `'ask'` returns `nameExists` and writes nothing; `'claim'` deletes that registration's two docs (and frees its direct seat) and creates an empty one for the caller, counter unchanged; `'separate'` registers normally. With the setting off, or two or more matches, or a caller who is already registered (a rename), it behaves as today. The response never carries the other person's data |
| `tablesSavePreferences` | Contract unchanged. Also sets `hasPreferences` on the name card |
| `tablesJoinTable` | Contract unchanged. Also sets `chosenTableIndex` on the name card |
| `tablesSaveSettings` | Input gains `mode?` (accepted in `draft` only, else `failed-precondition`), `expectedParticipants?: number \| null`, `allowReturnByName?: boolean` |
| `tablesCreateSession`, `tablesSaveTopics`, `tablesSetStatus`, `tablesComputePreview`, `tablesPublishRun` | no change |

Optional, only on Tal's yes (IA open question 1): `tablesRemoveParticipant` (host) `{ sessionId, uid }` → `{ removed: true }`, any status but `ended`; same deletes as cancel.

### 1.3 Functions files

Add: `functions/src/tableAssignment/fn_tablesCancelRegistration.ts`, `fn_tablesFixDetails.ts`, `roster.ts` (pure builders: name card from a private record; `rosterRef`, `counterRef`, `rosterByNameQuery` may live in `tablesAccess.ts`), `removeRegistration.ts` (the shared delete used by cancel and claim), `__tests__/tableAssignmentRegistration.test.ts`, `__tests__/tableAssignmentFixDetails.test.ts` (the existing test file is already 738 lines; do not grow it).

Change: `fn_tablesRegister.ts`, `fn_tablesSavePreferences.ts`, `fn_tablesJoinTable.ts`, `fn_tablesSaveSettings.ts`, `tablesAccess.ts`, `constants.ts`, `index.ts`. Add `scripts/backfillTablesRoster.ts` (tsx, Admin SDK, dry-run flag, batches of 500).

Tests to write: register writes both docs and the counter; second register renames both and does not count twice; the three `nameMatch` paths, setting off, two matches, wrong status; claim leaves no trace of the old answers and keeps the count; cancel in each status, cancel frees a direct seat, cancel twice; fix details renames, refuses foreign ids, added or missing topics are ignored or refused, hash unchanged, refused in draft and ended; mode change in draft and refusal later; compute and publish still pass with roster docs present; counter never negative.

### 1.4 Firestore rules (`firestore.rules`, Tables block)

- `tableAssignments/{id}`: `get` allowed to any signed-in user in every status (today drafts are denied, so the not-open screen can neither show the name nor update by itself). `list` stays host-only.
- `tableAssignmentParticipants`: remove both `isTableSessionHost` branches. Owner get, owner list, and the "missing own doc" get stay.
- `tableAssignmentRoster/{id}`: `get, list` when `resource != null` and (own uid, or host, or registered in the session and the session has `publishedRunId` or `mode == 'direct'`). `write: false`.
- `tableAssignmentCounters/{id}`: `get` when signed in and (`resource == null` or the session is readable). `write: false`.
- Topics, runs, seats: unchanged.

`tests/rules/table-assignment.test.mjs`: host can no longer get or list the private records; host lists the roster; a participant reads only their own card before publishing and their session's cards after; an outsider reads none; anyone signed in gets a draft session but not its topics; counter readable, nothing writable. Rules deploys are whole-file: deploy from a clean worktree.

No composite index is expected (all new queries are equality on `sessionId` plus one more equality or `in`); confirm in the emulator and add to `firestore.indexes.json` only if it asks. Never deploy indexes with `--force`.

### 1.5 The smallest client change, so the rules can close in this phase

`apps/tables/src/lib/tableAssignment/data.ts`: replace `subscribeParticipants` with `subscribeRoster`; add `subscribeCounter`, `subscribeTablemates`. `apps/tables/src/logic/participants.ts`, `logic/directTables.ts`, `components/TableCards.ts`, `components/HostFrame.ts`, `views/host/HostParticipants.ts`, `HostHome.ts`, `HostPreview.ts`, `HostAssignment.ts`: take `TableAssignmentRosterEntry`; drop the "gave a position / not specified" rows and their keys. Update `__tests__/fixtures.ts`, `logic/__tests__/hostLogic.test.ts`, `__tests__/smoke/hostScreens.test.ts`. No visual change in this phase.

### 1.6 What could break live data

- A host tab left open on the old build loses its participants listener when the rules deploy (permission denied, three retries, error box). A reload fixes it. Deploy hosting before rules.
- Sessions live at deploy show no names until the backfill has run.
- The new `tablesRegister` answer shape: an old participant tab reads `.participant`, which is absent only for `nameExists`, and that needs the setting a host can switch on only from the new build.
- `tableAssignmentCounters` is written with a blind increment inside the register transaction; a backfill that runs while people register can be off by one. Re-running it corrects the number.
- Nothing is deleted or renamed; no function is removed.

---

## Phase 2: WizCol look, shared frame, accessibility tool, participant screens

### 2.1 Look and frame

Add `apps/tables/public/brand/wizcol-logo.webp`, `wizcol-logo-dark.webp` (copy from the repo's `public/brand/`).

Change `apps/tables/index.html`: Open Sans and Rubik, theme colour, and a tiny inline script that applies stored display settings before first paint.

Rewrite `apps/tables/src/styles/_tokens.scss`: the decision-12 palette (primary #0b66d6, success #0c7d36, tints #e3efff/#0a4a9c and #d9f2e2/#0b5a2b, paper #fbfaf7, ink #263854) as tokens, with `[data-theme='dark']`, `[data-contrast='high']` and both together, taking the neutral values from `packages/shared-styles/src/tokens/_brand-wizcol.scss`. The dark and contrast values in `Accessibility.dc.html` are the reference. All type sizes in `rem` so the text-size setting scales everything. Every text pair checked at 4.5:1 in all four variants.

Change `_base.scss`, `_forms.scss`, `_participant.scss`, `app.scss`. Delete `_side-slider.scss`. Add `_a11y.scss`, `_modal.scss`, `_steps.scss`, `_rank-list.scss`, `_position-stops.scss`, `_my-table.scss`.

Add `src/lib/a11yPrefs.ts` (+ test): `{ theme: 'system' | 'light' | 'dark', contrast: boolean, scale: 87.5 | 100 | 112.5 | 125 | 150 }`, one localStorage key, applies `data-theme`, `data-contrast` and the root font size, follows the system theme live, survives blocked storage. Same behaviour as `apps/mass-consensus/src/components/accessibility/AccessibilityButton.tsx`.

Add `src/components/AccessibilityTool.ts`, `Modal.ts` (focus trap, Escape, returns focus, blurred backdrop, `aria-modal`), `StepHeader.ts`. Change `Shell.ts` (logo that follows the theme, language, the tool on every screen, host screens included), `StateBox.ts`, `ParticipantFrame.ts` (reads the counter; no topics subscription on screens that do not need it). Delete `SideSlider.ts`.

### 2.2 Participant screens

| Design | File | Notes |
|---|---|---|
| NotOpen, Main, Waiting, WaitingClosed, Cancelled | rewrite `views/participant/ParticipantHome.ts`; add `ParticipantWaiting.ts`, `ParticipantName.ts` | home picks the state; `/sessions/:id/name` is the same name form in edit mode |
| ReturnByName, CancelConfirm | add `views/participant/ReturnByNameDialog.ts`, `CancelDialog.ts` | modals |
| Rank | rewrite `views/participant/RankedPreferences.ts` | one list, tap to pick up to 3, picked rise in order, pointer-drag handle, arrow keys on the handle, `aria-live` announcement of the new place, optional explanation on demand |
| Position | add `views/participant/ParticipantPosition.ts` | five radio stops + "prefer not to answer", nothing preselected, save disabled until one is chosen |
| MyTable, MyTableOutside | rewrite `views/participant/ParticipantMyTable.ts` | pill from the person's own choices versus the table's topic; tablemates through `subscribeTablemates` |
| (no design) | keep `views/participant/DirectPicker.ts`, `ParticipantPreferences.ts` | free mode, new frame only |

Delete `views/participant/ParticipantTopics.ts`.

Logic: change `logic/participantStage.ts` (stages: notOpen, name, waiting, waitingClosed, cancelled, closedNotRegistered, myTable, ended; "cancelled" is a local flag plus a missing record), `logic/ranking.ts` (pick, unpick, move, ordered list), `logic/localDraft.ts` (choices and position kept between steps and across a failed save; the cancelled flag; the last name for "register again"). Add `logic/positionStops.ts` (stop to value; a stored value to its nearest stop for display), `logic/steps.ts` (3, 2 or 2), `logic/myTable.ts` (which choice the table is, or outside).

Save points: step 1 calls `tablesRegister`; the last step calls `tablesSavePreferences` once with choices and position together (it already replaces both). Editing re-runs the same two calls. Cancel calls `tablesCancelRegistration`.

Routes: change `routes.ts`, `paths.ts`, `router.ts` to the IA table: add `/sessions/:id/name`, `/sessions/:id/position`; redirect `/sessions/:id/topics` and `/sessions/:id/topics/:topicId` to `/sessions/:id`; guard the step routes. Update `__tests__/routes.test.ts`.

### 2.3 i18n (he, en, ar)

New groups, roughly 90 keys: `a11y.*` (10), `home.*` for not-open, name, count, steps hint (12), `rank.*` with the four hints and the handle label (12), `position.*` with stops, privacy line, feedback (14), `waiting.*` (14), `cancel.*` and `cancelled.*` (9), `returnByName.*` (5), `myTable.*` with pills, outside note, tablemates (10), shared buttons. Plurals ("אפשר להוסיף עוד שניים / עוד אחד", "42 כבר כאן") need per-language forms, Arabic dual included; write them as separate keys, not string joins. Delete the retired keys listed in the IA. Hebrew comes from the design files word for word.

### 2.4 Tests

Unit: `a11yPrefs`, `positionStops` (0/25/50/75/100; 37 displays as stop 2; "prefer not" is never 50), `ranking` (cap at 3, order, move bounds), `participantStage` (every status × registered × cancelled flag × mode), `steps`, `myTable`. Smoke (`__tests__/smoke/participantScreens.test.ts`): each state renders; the claimant's form is empty after "yes, it's me"; edit shows the person's own answers; closed waiting has neither edit nor cancel; keyboard reorder works; a locale test that he, en and ar have the same key set.

### 2.5 What could break live data

- A person with an older slider answer (say 37) who edits and saves stores the nearest stop (25). Not editing changes nothing.
- A participant mid-flow on the old build keeps working: the callables they use are unchanged.
- The cancelled and "continued elsewhere" states depend on a local flag; a cleared browser shows the name form instead, which is still correct.

---

## Phase 3: host and room screens

### 3.1 Files

| Design | File | Notes |
|---|---|---|
| HostSetup | add `views/host/HostSetup.ts`, `views/host/SetupTopics.ts`, `views/host/SetupSummary.ts` | route `/host/new` until the name is first saved (then `tablesCreateSession` with mode `ranked` and replace the URL), and `/host/sessions/:id` in draft |
| HostLive | add `views/host/HostLive.ts` | count from the counter doc, estimate `ceil(registered / tableSize)`, link, QR, "show on screen", "close and split" = `tablesSetStatus` then `tablesComputePreview` then go to preview |
| HostEdit | add `views/host/FixDetailsDialog.ts` | `tablesFixDetails` |
| HostPreview | rewrite `views/host/HostPreview.ts`; add `components/ChoiceSummary.ts`, `components/TableBand.ts`; change `components/TableCards.ts`, `components/MetricsPanel.ts` (collapsed "full data") | names from the roster |
| Room, RoomSeats | add `views/room/RoomScreen.ts` | `/host/sessions/:id/screen`; join page until published, then who sits where; inside `HostGate` |
| (no design) | keep and restyle `views/host/HostList.ts`, `HostAssignment.ts`, `HostParticipants.ts` (names and search only) | |

`views/host/HostHome.ts` becomes the status dispatcher. Delete `views/host/HostTopics.ts`, `HostSettings.ts`, `TopicEditor.ts`; keep `TopicImport.ts` as the body of "import from an existing discussion" inside Setup.

Logic: add `logic/topicList.ts` (`split(/[,،\n]+/)`, trim, drop empties and duplicates, 200-character cap), `logic/setupSummary.ts` (mix: about `ceil(expected / seats)` tables; free: tables from `buildDirectLayout` rules, seats versus expected, the shortage line), `logic/strictness.ts` (chip to number, number to chip or custom), `logic/autosave.ts` (debounce, one in-flight save per kind, states saved / saving / failed, flush before "open registration"), `logic/previewVerdict.ts`, `logic/closeness.ts` (very close: deviation up to half the tolerance; close: up to the tolerance; far: beyond; not enough answers: fewer than three known positions at the table), `logic/band.ts` (mean ± sd clipped to 0–100 for room and table). Change `logic/nextAction.ts`, `logic/settings.ts`, `logic/topics.ts`, `logic/metrics.ts`.

Styles: rewrite `_host.scss`; add `_setup.scss`, `_preview.scss`, `_room.scss` (projector sizes, print).

Routes: add `/host/new`, `/host/sessions/:id/screen`; redirect `/host/sessions/:id/topics` and `/settings` to `/host/sessions/:id`. Update route tests.

### 3.2 Autosave mapping (no new callables)

- Name: `tablesCreateSession` the first time, then `tablesSaveSettings({ title })`.
- Mix or sit: `tablesSaveSettings({ mode })`.
- Topics: `tablesSaveTopics` with the non-empty rows in order, keeping ids. An empty row is not sent.
- Position question, strictness, seats, expected people, return by name: `tablesSaveSettings`.

### 3.3 i18n (he, en, ar)

Roughly 80 keys: `setup.*` (30, including the two mode cards, paste-list labels with count plurals, strictness texts, the expert line with `{value}`, return-by-name warning, summary lines with `{tables}`, `{people}`, `{seats}`, `{missing}`), `live.*` (9), `fixDetails.*` (6), `preview.*` and `closeness.*` (22), `roomScreen.*` (6), autosave states (4). Number-bearing sentences need plural forms in all three languages.

### 3.4 Tests

Unit: `topicList` (comma, Arabic comma, new lines, mixed, duplicates, over-long), `setupSummary` (22 people at 7; shortage in free mode), `strictness` (0.2 is custom), `autosave` (order, retry, flush), `previewVerdict`, `closeness`, `band`. Smoke (`__tests__/smoke/hostScreens.test.ts`): Setup with no session yet, with a draft; mode switch; Live; the modal saves titles only; the preview hides the band below three answers and blocks a stale publish; the Room screen flips on publish; no host screen imports or renders a position or a choice of a named person.

### 3.5 What could break live data

- Drafts made before the redesign open in Setup. A tolerance that is not one of the three numbers shows as custom and is kept unless the host taps a chip.
- Topics that carry an explanation or a table cap keep them; Setup does not show or change them, and `tablesSaveTopics` must be sent with those fields passed through so autosave does not wipe them.
- Changing a setting after a preview exists still makes it stale; Fix details does not.

---

## 4. What the design shows that the code cannot honestly do

1. **"Nobody, including the host, sees the answer."** True for the host's app after phase 1. Not true for the database owner, and not retroactive (section 0).
2. **Intermediate position stops.** The design's "נוטים להשאיר אותה כמו שהיא" and "נוטים לשנות אותה" are hand-written rewrites of the host's free-text poles. Code cannot derive them. Buildable: stops 1 and 5 show the pole text; 2 and 4 use a template around the pole ("קרוב יותר ל: …" (?)); 3 is "בין שני הצדדים". Needs a copy decision in three languages.
3. **"שלושה צעדים קצרים, בערך דקה"** is only true with a position question in mix mode. The count must come from `logic/steps.ts`.
4. **"42 כבר כאן"** is the number registered, not the number in the room, and needs the new counter doc.
5. **"הדף יתעדכן לבד" on the not-open screen** needs the draft-read rule in 1.4; today the listener is refused and stops after three tries.
6. **"כדאי לדבר עם המארח"**: the host has no tool to act on it (IA open question 1).
7. **Preview** shows four counts; the data has a fifth (registered, never ranked) and verdicts other than "good" (IA open question 5).
8. **Setup** has no field for a topic's explanation or table cap, and "import" is still a pasted question id, not a picker.
9. **Free mode** is not drawn for the participant or for the host after opening.
10. **Room screen** needs the host signed in on the projector computer, and six tables fit the drawing while 300 people make about 43.
11. **Autosave** cannot save an empty name or an empty topic row; "נשמר אוטומטית" must be able to say it failed.
12. **Return by name**: the browser that registered first is not told it was continued elsewhere; its record is simply gone and it shows the cancelled screen. Two real people with one name, both saying "yes", overwrite each other.
13. **Waiting does not notify.** "השולחן שלכם יופיע כאן" works only while the page is open or reopened.

## 5. Conflicts between the approved decisions and brief section 7

| Brief rule | Decision | Resolution taken |
|---|---|---|
| At least 48px tap targets | Position stops are drawn 30px (44px when chosen) | The drawn dot may stay; the tap area of each stop is 48px or more. Check at 150% text size on a 360px screen |
| "Not specified" is the visible state name (לא צוין) | The design says "מעדיפים לא לענות" | One concept, one label: the design's wording wins everywhere; "לא צוין" is retired |
| The host sees names and counts only | The host may switch on return by name | Kept: the claimant and the host see no old answers. But the switch lets anyone who types a name erase that person's answers and then cancel them, which bends decision 6 ("only from the browser that registered"). The warning text in Setup is the only guard |
| A participant never sees another person's position or preferences | My table shows tablemates' names; the Room screen shows every table | No conflict in the letter (names only), but participants now read name cards of their session after publishing. Rule added in 1.4 |
| Every word through translation files | Stop labels built from host text (section 4, item 2) | Template keys |
| People are told before they rank | The note sits below the list on Rank | Kept on the Rank screen; it must be visible without scrolling past the continue button on a small phone (UX) |
| Brief section 8 names violet #7a5af5 as the accent | Decision 12 sets blue #0b66d6 | Decision 12 wins; section 8 is out of date |

## 6. Deploy order, when asked

1. Build and repack `shared-types`; deploy the changed and new functions by name (`tablesRegister`, `tablesSavePreferences`, `tablesJoinTable`, `tablesSaveSettings`, `tablesCancelRegistration`, `tablesFixDetails`, `tablesRemoveParticipant`, `tablesComputePreview`, `tablesPublishRun`), region me-west1.
2. Run `scripts/backfillTablesRoster.ts` (dry run, then real) on the production project.
3. Run `scripts/scrubTablesRunMetrics.ts` (dry run, then real): runs computed earlier still hold exact figures and a readable input hash.
4. Deploy Tables hosting.
5. Deploy `firestore.rules` from a clean worktree. Phase 3 adds no rules: `tableAssignmentRunInputs` is unmatched, so no client can read it.
