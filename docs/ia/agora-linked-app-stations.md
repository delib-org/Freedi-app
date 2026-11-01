# Agora: Stations in another app (linked stations) — IA spec + implementation plan

Status: Phase 1 built 2026-10-20 (main-app question, end to end; local dev, not deployed). Phases 2–3 planned.
Date: 2026-10-20
Builds on: `agora-lesson-builder.md` (step labels, add-step sheet), `agora-student-clarity.md` (station / note / village vocabulary, plural address)
Size note: this file holds the IA and the technical plan together, as asked. If Phase 2/3 grow, split the plan out to `agora-linked-app-stations-plan.md`.

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Teacher, building the lesson (`/teach/start`, Lesson flow) | Make one step of the tour happen in a WizCol question or a Join session | Engine ids, statement ids, the words "token", "handoff", "custom auth" |
| Teacher, during the lesson (`/teach/session/:id`) | See who went to the task and who came back | Students' activity outside this lesson |
| Student in the village (`/#!/play/:id`), 12-15, Hebrew, phone | Tap the station, do the task, come back to the same station | A login screen, an account choice, a second pseudonym prompt |
| Student as a guest in the other app (main app / Join) | Do the task, then "Back to the village" | "Sign in with Google to save", the main app's home feed, other groups, engagement nudges, their real name |
| Other participants of the linked question (may be adults, may be public) | Deliberate as usual | Any student's real name, the school, the class |

## 2. Object model
- **Linked station** = one step of the lesson plan (`AgoraStagePlanItem`) with `stage: AgoraStage.linked` and a `link` (`AgoraStationLink`). It is a station in the village (`booth:<itemId>`), like a question step.
- **Station link** (`AgoraStationLink`): `{ app: AgoraLinkedApp, statementId, title, linkedAt }`. 1 step : 1 link. `app` ∈ `main` | `join` (`mc` reserved for later). `title` is the linked question's text cached when the teacher linked it (shown on the card and the booth; never trusted for access).
- **Linked question** = an existing QUESTION Statement in the shared Firestore, owned outside the session's tree (`parentId`/`topParentId` belong to the teacher's own main-app group or Join space). Agora never writes into it; the student writes options/evaluations under it as usual in that app. This is why the step does NOT reuse `item.statementId` (which means "the question Agora created in its own tree" and is read by `fn_onAgoraEvaluation`, `carryOutcome`, `dealNotes`).
- **Station visit** (per student, per linked step): `AgoraParticipant.stationVisits[itemId] = { openedAt, returnedAt? }`. Lifecycle: not opened → opened → back. A courtesy signal like `whereabouts`, never a gate.
- **App handoff** (server only, `appHandoffs/{sha256(code)}`): one-time code, 5 min TTL, single use, names `{uid, sessionId, itemId, app, statementId}`. Redeemed in the other app for a Firebase custom token for the SAME uid. Lifecycle: minted → redeemed (deleted) | expired (TTL).
- **Guest mode** (in the other app): the browser is signed in as the student's Agora uid, and the ID token carries the developer claim `agora: { s: sessionId, i: itemId }`. Guest mode = that claim is present.

Why a new stage `linked` and not a new question kind (the WizCol-rounds precedent): rounds ARE questions — same desk, board, rating, carried outcome — and differ only in prompt and scale, so they belong under `question`. A linked station has none of that machinery: no desk, no board, no Agora ratings, no outcome. As a question kind, every one of the ~60 `AgoraStage.question` readers (`stagePlanEditor`, `classProgress`, `villageRoute`, `stageAdvance`, `carryOutcome`, `fn_onAgoraEvaluation`, `fn_agoraRewordQuestion`, `dealNotes`, boards, projector) would have to learn to exclude it, and a forgotten one would deal notes or compute an outcome for a question Agora does not own. A new stage is excluded from all of them by default and opted in only where it belongs (village booth, plan editor, class progress, advance).

## 3. Labels
| Concept | EN label | HE label | i18n key | Route / URL | Code type | Synonyms to retire |
|---|---|---|---|---|---|---|
| The step type | Task in another app | משימה באפליקציה אחרת | `teacherStage.linked`, `planb.desc_linked` | — | `AgoraStage.linked` | "external stage", "activity" (clashes with `/teach/activity`), "link step" |
| Its one-line description (sheet) | Students open a WizCol question or Join session and come back | התלמידים פותחים שאלה ב־WizCol או ב־Join, וחוזרים לכפר (?) | `planb.desc_linked` | — | — | — |
| Which app | Where | איפה | `linked.app_label` | — | `AgoraLinkedApp` | "platform", "tool" |
| Main app | WizCol question | שאלה ב־WizCol | `linked.app_main` | `app.wizcol.com/statement/:id` | `'main'` | "Freedi", "main app" (code only) |
| Join | Join session | מפגש Join (?) | `linked.app_join` | `/q/:qid`, `/m/:mid/q/:qid` | `'join'` | — |
| The pasted link | Link to the question | הקישור לשאלה | `linked.link_label`, `linked.link_help` | — | `AgoraStationLink` | "URL", "address" |
| Link accepted | Linked to: <title> | מקושר לשאלה: <title> | `linked.linked_to` | — | `link.title` | — |
| Link errors | That is not a WizCol/Join question link · Question not found · Only the question's admin can link it · This link is not a question | הקישור הזה אינו של שאלה ב־WizCol או ב־Join · השאלה לא נמצאה · רק מנהלי השאלה יכולים לקשר אותה · הקישור הזה אינו שאלה | `linked.err_bad_link`, `linked.err_not_found`, `linked.err_not_admin`, `linked.err_not_question` | — | `StationLinkError` | — |
| The station, to students | Station (existing) | תחנה | (existing `village.*`) | `booth:<itemId>` | `VillageBoothKind 'linked'` | — |
| The action at the station | Open the task | לפתוח את המשימה | `linked.open` | — | — | "go to", "start activity" |
| While opening | Opening... | פותחים... | `linked.opening` | — | — | — |
| Couldn't open | No connection. Try again | אין חיבור. נסו שוב | `linked.err_offline` | — | — | — |
| The way back (in the other app) | Back to the village | חזרה לכפר | main: `Back to the village`; Join: `agoraGuest.back` | `AGORA/#!/play/:id?at=booth:<itemId>&back=1` | — | "Return", "Close", "Exit" |
| Guest bar text | A task from your Agora lesson | משימה מהשיעור באגורה (?) | main: `A task from your Agora lesson`; Join: `agoraGuest.bar` | — | — | — |
| Expired link | This link has expired. Go back to the village and open the task again | הקישור כבר לא בתוקף. חזרו לכפר ופתחו את המשימה שוב | main: `This link has expired. Go back to the village and open the task again`; Join: `agoraGuest.expired` | — | — | — |
| Lesson over | The lesson has ended | השיעור הסתיים | main: `The lesson has ended`; Join: `agoraGuest.ended` | — | — | — |
| Back in the village | Welcome back | ברוכים השבים | `linked.welcome_back` | — | — | — |
| Teacher progress | Opened · Came back | פתחו · חזרו | `linked.progress_opened`, `linked.progress_back` | — | `stationVisits` | "visited", "completed", "done" (we cannot know "done") |
| Phase 2 counts | Wrote N · Rated M | כתבו N · דירגו M | `linked.progress_counts` | — | `AgoraStationProgress` | — |
| Teacher's own look | Open the question | לפתוח את השאלה | `linked.teacher_open` | plain app URL, no handoff | — | — |

Main app keys follow the shared-i18n convention (the English sentence is the key) in all 7 files `packages/shared-i18n/src/languages/{ar,de,en,es,fa,he,nl}.json`. Agora keys go in `apps/agora/src/lib/locales/{ar,de,en,es,he,nl}.ts` (+ `planBuilderStrings.ts` for `planb.*`). Join keys in `apps/join/src/lib/locales/{ar,de,en,es,fa,he,nl}.ts`. Hebrew marked (?) needs Tal's check.

## 4. Hierarchy (per role)
Role: Teacher (building). Same tree as `agora-lesson-builder.md`; one new step type.
```
0 Start a lesson (/teach/start)
1   Advanced settings (fold)
2     Lesson flow (fold)
3       Step card "Task in another app"   (chip + linked title, or the red "needs a link" edge)
4         Step editor: Where (radio) · Link to the question · Title (prefilled) · What to do there (explanation)
3       Add a step -> sheet -> "Task in another app"
```
Depth 4 at the editor is inherited from the existing builder (inline, not a page); this spec adds no depth.

Role: Teacher (live)
```
0 Lesson console (/teach/session/:id)
1   Class progress card            (current step = linked: "Opened 18 · Came back 12")
1   Class tab (/teach/session/:id/class)
2     Student row: station status (opened / came back) [+ Phase 2 counts]
1   Contextual: Open the question  (opens the app as the teacher, new tab)
```
Role: Student
```
0 Village (/#!/play/:id)
1   Station booth:<itemId>  -> station card: title, what to do, "Open the task"
    -- leaves Agora --
0'  Guest home = the linked question in the other app (its own tabs: options / vote / ...)
1'    That app's own screens for the question, nothing above it
    Exit (always visible): Back to the village -> Village, standing at booth:<itemId>
```
The guest's world is one question deep: the other app's home, groups list and profile are out of reach (one home per role).

## 5. Navigation model
- Global (village): unchanged four doors. At a linked station "My note" and "All notes" show their existing hints (`village.nav.hint_no_note`, `village.nav.hint_no_board`); there is no note here.
- Local (station card): one primary action, "Open the task". Teacher-led navigation still rules: a station ahead of the room is closed (same `open` rule as booths).
- Contextual (other app): a persistent "Back to the village" bar on every guest screen, including the loading, 401, expired and 404 pages. The other app's logo/home leads to the linked question, not to its home feed.
- Out: `window.open` in the station tap (a new tab in a browser; the in-app browser sheet in the installed PWA, whose own Done/X also returns the student to the untouched village). If the browser blocks it (returns `null`), same-tab `location.assign` instead.
- Back: (1) if this tab was opened by Agora (`window.opener` and the gate saw `via=open`): `opener.postMessage({type:'agora-station-return', itemId}, AGORA_ORIGIN)` then `window.close()`; (2) otherwise, or if close did not happen within a beat: `location.assign(returnUrl)`. In both cases the guest is signed out of the other app first.
- Return URL (built by the other app from a constant `VITE_AGORA_ORIGIN` + ids from the token claim, never from a URL parameter): `${AGORA_ORIGIN}/#!/play/${sessionId}?at=booth%3A${itemId}&back=1`. Agora strips `at`/`back` with `replaceState` after reading them.
- Deep link into the other app (built by the server at mint time): main `${MAIN_ORIGIN}/statement/${statementId}#freedi-handoff=${code}&via=open`; Join `${JOIN_ORIGIN}/q/${statementId}#freedi-handoff=...`. Fragment, not query: it never reaches server logs or Referer (same choice as main→Sign).
- Arrival in Agora: `at` is a hint. If the teacher has since called the class elsewhere or advanced, the summons logic wins (`lib/flows/summons.ts`); if the session ended, the student lands on results.

## 6. Task flows
Role: Teacher, task: add a linked station (5 steps)
1. Lesson flow — tap "+" between two cards (or "Add a step").
2. Add-step sheet — tap "Task in another app". Card inserted, editor opens.
3. Step editor — "Where": WizCol question (default) or Join session.
4. Step editor — paste the link. On blur the server checks it (`agoraCheckStationLink`) and shows "Linked to: <title>" or the exact error; title field prefills with the question text.
5. "Done". The plan saves with the lesson (`agoraCreateSession` / `agoraUpdateStagePlan` re-verify the link).

Role: Student, task: do the task and come back (3 taps)
1. Village — walk to (or be called to) the station; station card shows title + "what to do".
2. Tap "Open the task" — the other app opens on the linked question, already signed in as them (no screen in between except a short loading state).
3. Work there (write, rate, vote — that app's own flow).
4. Tap "Back to the village" — the tab closes (or navigates) and they stand at the same station; "Welcome back".

Role: Teacher, task: see who went and who came back (0-1 taps)
1. Lesson console — the progress card, while the linked step is current, reads "Opened n · Came back m".
2. Tap Class tab — per student: opened / came back (Phase 2: wrote N, rated M).
3. (Optional) "Open the question" — the teacher's own view of all the work, as the question's admin.

## 7. Screen inventory
| Screen | App / route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| Add-step sheet entry | Agora `/teach/start` (modal) | Offer the type | — | — | — | — | Card inserted, editor open |
| Linked step editor | Agora (inline) | Point the step at a question | Link field empty, card flagged "needs a link" | "Checking link..." | `linked.err_*` under the field | `err_not_admin` | "Linked to: <title>" |
| Station card (linked) | Agora `/#!/play/:id` booth | Send the student to the task | — | `linked.opening` | `linked.err_offline` + retry | Station closed (existing booth rule) | Opened; on return "Welcome back" |
| Handoff gate | main `/statement/:id#freedi-handoff=` / Join `/q/:qid#...` | Sign in as the student | — | Existing loading page | Expired → message + Back to the village | — | Question screen |
| Guest bar | main + Join, every guest screen | One way back | — | — | — | Shown on 401 too | Tab closes / village |
| Lesson-over state | main + Join | Say it ended, offer results | — | — | — | — | Back goes to results |
| Class progress (linked) | Agora `/teach/session/:id[/class]` | Who opened / came back | "No one has opened it yet" | Existing | Existing | Existing teacher guard | All came back |

## 8. Findability
- Plan ≤ `AGORA_STAGE_PLAN.MAX_ITEMS`; class list as today. Phase 1 links by paste only.
- Phase 3: "Pick from my WizCol questions" list with search, reusing Studio's link-existing-questions eligibility (`studio-link-existing-questions`), so a teacher with many questions can find one without leaving Agora.

## 9. Architecture
### 9.1 Identity: options weighed
All apps share one Firebase project per environment (`wizcol-app` prod, `freedi-test` test), so one uid can be valid everywhere; only browser storage is per origin.
- **(a) One-time code → custom token (RECOMMENDED).** Already in production twice: Odyssey→Agora (`odysseyMintAgoraHandoff`, raw token in `?handoff=`, weaker) and main→Sign (`createAgreementHandoff`/`redeemAgreementHandoff`: sha256-hashed single-use code, `#freedi-handoff=` fragment, transaction delete, then `createCustomToken`; signBlob IAM granted 2026-10-11). Copy the Sign pattern, not Odyssey's. The student arrives as their Agora uid, so the teacher's view is a plain uid join, and every write in the other app is attributable without a mapping table.
- **(b) Iframe/overlay inside Agora.** Rejected for now. It does not solve identity (the iframe's Firebase storage is still the other origin's, so it needs the same handoff); main hosting sends `X-Frame-Options: DENY` alongside `frame-ancestors *.wizcol.com`, Agora also runs on `agora-wizcol.web.app` (cross-site, so storage partitioning applies), the village is already a WebGL iframe (a second heavy app on a 12-year-old's phone risks OOM), Google popups and the back gesture misbehave inside frames. The PWA's in-app browser sheet from `window.open` gives the same "village untouched underneath" benefit natively.
- **(c) Ticket + mapping, no sign-in.** The other app stays on its own anonymous uid and records `otherUid → agoraUid` from a signed ticket. Avoids replacing an account on a shared device, but two uids per student, a mapping in every query, and pseudonyms that differ per app. Keep as the fallback if Tal rejects (a)'s account switch (Q3).

### 9.2 Data model (`packages/shared-types`, Valibot, ms timestamps)
- `agoraEnums.ts`: `AgoraStage.linked = 'linked'`. Not in `AGORA_STAGE_ORDER` (plan-only, like `question`).
- New `models/agora/stationLink.ts`: `AgoraLinkedAppSchema = picklist(['main','join'])`; `AgoraStationLinkSchema = object({ app, statementId: string(), title: string(), linkedAt: number() })`; `AGORA_STATION_LINK = { HANDOFF_TTL_MS: 300_000 (5 min), CODE_CHARS: 100, MAX_TITLE: AGORA_STAGE_PLAN.MAX_TITLE_LENGTH }`; pure helpers `parseStationLink(url, hosts) → {app, statementId} | null` (main: `/statement/:id`, `/statement-screen/:id/*`, `/stage/:id`; Join: `/q/:qid`, `/m/:mid/q/:qid`; host allow-list per env) and `stationReturnPath(sessionId, itemId)`.
- `stagePlan.ts`: `AgoraStagePlanItemSchema.link: optional(AgoraStationLinkSchema)`; add `linked` to `AGORA_PLANNABLE_STAGES` (multi-instance); `validateStagePlan` error `linked_needs_link`.
- `agoraParticipant.ts`: `stationVisits: optional(record(string(), object({ openedAt: number(), returnedAt: optional(number()) })))`.
- Callable types: `MintStationHandoffRequest {sessionId, itemId}` / `Response {url}`; `RedeemAppHandoffRequest {code, app}` / `Response {token, displayName}`; `CheckStationLinkRequest {url}` / `Response {app, statementId, title}`.
- Strict-parse trap: every Agora client `parse`s `AgoraSessionSchema`; a stale PWA bundle meeting `stage: 'linked'` fails to parse. Deploy order (main hosting before Agora hosting) and the stale-client handling in §11.5 cover it; no flag (Tal, Q5).

### 9.3 Callables (all `functionConfig.region` = me-west1)
- `agoraCheckStationLink({url})` — teacher (or co-teacher) only; parse, load statement, require `statementType === question`, require caller is its admin (creator or admin subscription on it/its top parent); return title.
- `agoraUpdateStagePlan`, `agoraCreateSession` — `sanitizeStagePlan` must copy `link` through (it rebuilds items field by field and would drop it today); re-run the check for new/changed links; frozen items untouched.
- `agoraMintStationHandoff({sessionId, itemId})` — caller must have a participant doc in the session; item must be `linked`, index ≤ `stageIndex`, session not ended. Write `appHandoffs/{sha256(code)}` `{uid, sessionId, itemId, app, statementId, expiresAt, createdAt}`; return the server-built URL (9.5). Agora prefetches it when the station card renders and refreshes at half-TTL, so the tap can call `window.open` synchronously (no popup blocker).
- `redeemAppHandoff({code, app})` — transaction get+delete, check expiry and `app`; ensure the uid can read/write the linked question (create a member subscription on it if its access is not open — Q2); set the Auth display name to a generated pseudonym (`anonNames.ts`), never `realName` and never a `named`-session typed name; `createCustomToken(uid, { agora: { s, i } })`.
- Rules: `match /appHandoffs/{id} { allow read, write: if false; }`; Firestore TTL policy on `appHandoffs.expiresAt` (gcloud). `agoraParticipants` rule is a deny-list, so the owner may already write `stationVisits`; no rule change.

### 9.4 Client gates
- Main app: new `src/controllers/auth/agoraGuest.ts`, run before `publicAuthHandler`'s anonymous sign-in (same `handoffPending` guard Sign's `AuthSync` uses, so no stray anonymous user is created): read fragment, `replaceState` it away, redeem, `signInWithCustomToken`, `updateProfile(displayName)`, `setUserToDB`. `isAgoraGuest()` reads `getIdTokenResult().claims.agora` (survives reloads; `isAnonymous` is unreliable after a custom-token sign-in). Guest mode hides Google link/sign-in prompts and Hooked engagement nudges (a Google link would tie a minor's Agora uid to a real identity) and pins home to the linked question.
- If a different, non-anonymous account is signed in on that browser, ask before switching (Q3).
- Join: same gate in `apps/join/src/lib/user.ts` before `ensureUser()`; bar in `views/Solutions.ts`/`Chat.ts`.
- Agora: `lib/stationHandoff.ts` (prefetch, open, fallback, message listener with `event.origin ∈ {MAIN_ORIGIN, JOIN_ORIGIN}`); `GameController` reads `at`/`back`, stands the student at the booth, writes `stationVisits[itemId].returnedAt`; `openedAt` written at tap.

### 9.5 Return and close contract
| Direction | Channel | Payload | Guard |
|---|---|---|---|
| Agora → app | `window.open(url)` | `#freedi-handoff=<code>&via=open` | URL built by the server from constants; code single-use, 5 min |
| App → Agora (same tab or fallback) | `location.assign` | `/#!/play/:id?at=booth:<itemId>&back=1` | Origin is the app's own `VITE_AGORA_ORIGIN` constant; ids from the token claim (or, on an expired code, from the fragment's `as=<sessionId>~<itemId>` hint) — no user-supplied URL, so no open redirect; MC's `returnTo` allow-list stays the model if a generic `returnTo` is ever added |
| App → Agora (popup) | `opener.postMessage` | `{type:'agora-station-return', itemId}` | `targetOrigin = AGORA_ORIGIN`; Agora checks `event.origin` and that `itemId` is in its plan |

"Finished" is not knowable in a deliberation app, so Phase 1 records only what is true: opened (tap) and came back (return). Phase 2 adds facts read server-side (ids only, no text): options created and evaluations by session uids under the linked question.

### 9.6 Edge cases
- Offline at tap: no prefetched code → `linked.err_offline`, retry. Offline in the other app: that app's own behaviour.
- New tab closed with the X: Agora stays as it was; visit shows "opened" only.
- Code expired (tab left open): message + Back to the village (works from the `as=` hint).
- Teacher advanced meanwhile: return lands where the teacher's call says; session ended → results.
- Device later used at home: the guest is signed out on Back; if they never pressed Back the guest stays signed in there. Claim-based bar still points to the village (which shows "ended").
- Shared device in team mode: the team uid is the unit, as everywhere in Agora.

## 10. Phased plan
**Phase 1 — main-app question, end to end** (smallest slice)
- shared-types: `agoraEnums.ts`, new `stationLink.ts` (+ `__tests__/stationLink.test.ts`), `stagePlan.ts` (+ validator tests), `agoraParticipant.ts`, callable types, `index.ts`; build, then repack the tgz for functions.
- functions: `agora/stagePlanInput.ts`, `agora/fn_agoraUpdateStagePlan.ts`, `agora/fn_agoraCreateSession.ts`, new `agora/stationLink.ts` (verify), `agora/fn_agoraCheckStationLink.ts`, `agora/fn_agoraMintStationHandoff.ts`, new `handoff/appHandoff.ts` (digest/mint/redeem shared helper; later fold Sign's into it), `handoff/fn_redeemAppHandoff.ts`, `index.ts`; `agora/stageAdvance.ts` (confirm linked is a no-outcome step). Jest: mint refuses non-participants / closed / future items; redeem single-use, expiry, wrong app; sanitize keeps `link`.
- firestore.rules (`appHandoffs` deny), TTL policy.
- Agora: `lib/flows/stagePlanEditor.ts` (AddChoice), `views/teacher/planEditor/{AddStepSheet,StepEditor,stepMeta}.ts`, `lib/flows/villageRoute.ts` (`VillageBoothKind 'linked'`, `villageDesk` null) + tests, new `components/LinkedStation.ts`, new `lib/stationHandoff.ts`, `views/GameController.ts`, `lib/callables.ts`, `lib/flows/classProgress.ts` (+ test), `components/VillageShell.ts` (kind posted; world needs a pavilion look for `linked` — UX), locales ×6, `planBuilderStrings.ts`, env `VITE_MAIN_ORIGIN`.
- Main app: `src/controllers/auth/agoraGuest.ts` (+ test), hook in `landingAuth.ts`/`publicAuthHandler.ts`, `src/controllers/db/` callable, guard sign-in prompts and engagement nudges, return bar molecule (UX designs it), shared-i18n ×7, env `VITE_AGORA_ORIGIN`.
- E2E (Agora Playwright, solo ports): teacher adds a linked step with a seeded main question → student opens → main app shows the question as the same uid with the bar → Back → Agora at `booth:<itemId>`, visit has both stamps.

**Phase 2 — Join + teacher counts**: Join gate + bar + locales ×7; `agoraStationProgress({sessionId,itemId})` teacher-only callable (counts per uid, `in` queries chunked by 30); Class tab counts.
**Phase 3 — later**: MC (Next.js; redeem in an `AuthSync`-style component like Sign; survey completion can auto-return); "pick from my questions" picker; optional carry of the linked question's top options into later steps as `AgoraCarriedAnswer`; "create the question for me".

**Deploy (each phase, test then prod, from a clean tree merged with main)**
1. `cd packages/shared-types && npm run build`, repack for functions.
2. `npm run deploy:f:test -- agoraCheckStationLink,agoraMintStationHandoff,redeemAppHandoff,agoraUpdateStagePlan,agoraCreateSession` (then `deploy:f:prod`).
3. Rules (whole file) + gcloud TTL on `appHandoffs.expiresAt`.
4. Main hosting first (the gate must exist before any link is minted), then Agora hosting (the option appears). Join hosting in Phase 2.

## 11. Decisions (Tal, 2026-10-20) and assumptions
1. Names approved: "Task in another app / משימה באפליקציה אחרת", "Back to the village / חזרה לכפר".
2. Private questions: yes — redeem adds the student as a **member** of the question's governing statement (the question when it overrides access, else its top parent) unless access is open or the uid already holds a role there (admin stays admin, banned stays banned).
3. A device signed in to WizCol with a real account: switch to the class guest **after a confirm** (the gate asks before redeeming, so the code is not spent on "no").
4. Minors writing in public questions under pseudonyms: **allowed**. The guest's name is their Agora pseudonym (`participant.anonName`); in a `named` session a fresh generated pseudonym — never the typed or real name.
5. **No flag, no delay** — the builder option ships at once. Stale clients are handled instead:
   - The shared plan schema is still strict (`enum_(AgoraStage)`), so an Agora bundle built before `linked` cannot parse a session whose plan holds one. Those already-deployed bundles show their generic error screen (they cannot be changed); their service worker (`registerType: autoUpdate`, update check on entry) picks up the new bundle on the next launch/reload and reloads itself.
   - From this release on: `lib/session.ts` treats an unknown `stage` ANYWHERE in the doc (`stagePlan[i].stage` included, not only the top-level `stage`) as "outdated" — the calm "refresh" screen instead of the error — and asks the service worker for the new bundle at once (`lib/appUpdate.ts`); `index.ts` also re-checks for a deploy every time the tab comes back to the front, so long-lived phone tabs update before the session they watch changes.
   - Residual risk: a tab opened BEFORE this deploy, on a session whose plan the teacher edits to add a linked step mid-lesson, shows the old error screen until reloaded.
6. Linked stations will carry results back into the lesson (Phase 3). Not built; not designed out: the visit lives on `stationVisits[itemId]`, the link carries `app` + `statementId`, and Phase 2's server-side counts (`agoraStationProgress`) are the seam a Phase 3 `AgoraCarriedAnswer` carry would read from. `closedQuestionItems` deliberately still ignores `linked` until then.

Assumed: the teacher is an admin of the linked question (enforced: `agoraCheckStationLink` and every plan save refuse otherwise); Join's prod origin is listed in the host allow-list; window.open is allowed from the station tap (prefetched code, synchronous open; same-tab fallback when blocked).

### Phase 1 as built (deviations from §9–10)
- The step editor has no "Where" radio: only `main` is linkable until the Join gate exists (`AGORA_LINKABLE_APPS`); a Join link is refused as `bad_link`.
- The guest claim carries the linked question too: `agora: { s, i, q }` — the main app pins its homes (`/`, `/home`, `/start`, `/login`, `/my`) to `/statement/<q>`.
- The return origin is the constant `VITE_AGORA_ORIGIN` (default `https://agora.wizcol.com`). A student who opened Agora on `agora-wizcol.web.app` returns to `agora.wizcol.com`, a different origin with its own storage. Keep students on the canonical domain (the invite emails already are).
- The 3D world's pavilion look for `linked` is not drawn yet: the world falls back to the open-question booth (sign shows the station title; no desk bubble). The station card opens in the booth panel.
- Guest mode also hides the main app's install / notification prompts (`PWAWrapper`) and the first-run terms flow (`FirstRunGate`).
- The main app opens in its own saved language (default English); it does not inherit Agora's language yet.
- Strings: Agora keys live in `apps/agora/src/lib/linkedStationStrings.ts` (merged through `planBuilderStrings`), main-app keys in shared-i18n ×7.

## 12. Handoff to UX
Fixed by this spec: the step type and its labels; one action at the station; the guest's world is one question deep with one exit on every screen; return lands at the same station; progress says only "opened / came back" until Phase 2.
Yours to decide: station card and booth look for `linked`, the guest bar's form and placement in the main app and Join (RTL, phone), the "Welcome back" moment, the loading state during redeem, how errors read.
