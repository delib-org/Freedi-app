# apps/agora — Classroom Deliberative Time-Tunnel Game

## Context

Tal wants a new app for async deliberation packaged as a classroom game. A teacher picks a historical topic (e.g., the French Revolution); students "travel through a time tunnel" to save the era by finding a solution acceptable to all sides. The game wraps the wizcol deliberation loop (propose → rate others → suggest improvements → iterate) in a narrative shell with: AI-graded value identification, camp positioning (e.g., Royalist ↔ Jacobin), a **bridging score** where cross-camp support is worth more than same-camp support, AI historical-plausibility scoring, simulated "country health metrics," per-student points and a collective class score with success/failure ending videos. All participants are anonymous to each other; the teacher sees aggregates.

**Decisions made with the user:**
- New app in the Freedi monorepo: **`apps/agora`**
- **Mithril.js + Vite SPA** (modeled on `apps/flow` / `apps/join`), PWA day one → Capacitor-ready for native later
- Full platform including **teacher authoring**: AI generates a complete topic package from a topic prompt; teacher reviews/edits and **uploads videos per scene** (text/dialogue fallback when no video)
- **Both device modes**, teacher chooses per session: individual, or 2–3-student teams sharing a device (team = the anonymous participant unit)
- **Reuse existing Freedi AI infra** (OpenAI via `functions/src/config/openai-chat.ts`; there is no Anthropic/Gemini — Gemini is a compat shim over OpenAI)
- In-app notifications + badge/point scoring via the existing engagement system
- Hebrew-first (RTL) + other Freedi languages
- **Stunning, game-first UI is a top priority** — the app must feel like a game, not a form. 2D/2.5D maps are explicitly on the table.
- The detailed plan document itself gets committed to the repo at **`plans/agora-deliberative-game-plan.md`** as the first implementation step.

## Architecture summary

- **Client**: `apps/agora`, Mithril + Vite, closure components, module-state + `m.redraw()`, flow-style local `t()` i18n (language metadata from `@freedi/shared-i18n`), `vite-plugin-pwa`. Dev port **3009** (flow 3004, join 3007, studio 3008 taken).
- **Server**: new `functions/src/agora/` folder — callables + Firestore triggers, region `me-west1`, exported from `functions/src/index.ts`.
- **Identity**: Firebase `signInAnonymously` (flow's `ensureUser` pattern, `apps/flow/src/lib/user.ts`) → real `request.auth.uid` so rules and evaluation triggers work unchanged. In team mode, one device = one anon uid = one team.
- **Datastore decision**: proposals/ratings/suggestions **reuse `Collections.statements` + `Collections.evaluations`** — this gets the entire consensus pipeline (`functions/src/evaluation/onCreateEvaluation.ts` → `statementEvaluationUpdater` → `agreementIndex` from `packages/shared-types/src/utils/consensusCalculation.ts`), plus engagement credit tracking and social-proof notifications, for free. `apps/flow/src/lib/deliberation.ts` already proves a Mithril SPA can do these client writes. Game-specific state (topic packages, sessions, participants/camps, scores, value answers) goes in new `agora*` collections with their own access rules.

## Visual & game design — "stunning UI, games in mind"

This is a first-class requirement, not polish. The app gets its own game-flavored design system (SCSS tokens + BEM, per repo conventions) — dark, cinematic, era-themed; not the Freedi productivity look.

### The 2.5D Era Map — the game hub
The centerpiece: instead of a linear wizard, the student journey is staged on an **illustrated 2.5D isometric map of the era** (e.g., Paris 1789). Each game stage is a *location* on the map:

- **Time tunnel** → arrival portal (animated vortex entry)
- **Period explainer** → observatory/lookout point
- **Perspectives** → the Palace (Royalist) and the Assembly (Jacobin) — the student "walks" to each
- **Positioning** → a bridge between the two buildings; the student literally places their marker along it
- **Deliberation** → the town square (the *agora*), which fills with glowing "idea lanterns" (one per proposal) as students contribute; lantern brightness = consensus, lantern color blend = cross-camp support (bridging made visible)
- **Health metrics / outcome** → the map itself reacts: prosperity (lights, banners, crowds) vs collapse (smoke, fires) as the simulated country-health metrics move — the success/failure ending plays over the transformed map

The map doubles as a **progress indicator** (your marker moves), a **live class visualization** (anonymous markers of classmates drift between locations, giving co-presence without identity), and the **results screen**.

**Tech**: layered SVG + CSS 3D transforms for the map (parallax layers, `transform: rotateX()` ground plane, animated sprites as positioned SVG/PNG layers) — lightweight, RTL-safe, PWA-cacheable, no canvas engine needed for v1. **PixiJS is the upgrade path** if we later want particles/thousands of sprites; the map component (`EraMap`) is isolated behind one interface so the renderer can be swapped. All motion honors `prefers-reduced-motion`.

**Assets**: `agoraGenerateTopicPackage` also generates **era artwork via the OpenAI Images API** (`gpt-image-1`) — map backdrop, location vignettes, and the two character portraits in one consistent painterly style per topic (style-locked prompt template), stored in Firebase Storage alongside teacher videos. Teacher can regenerate or replace any image in the TopicEditor. Fixture mode ships with a hand-made French Revolution asset pack (also the demo/seed content).

### Juice & feedback (the "game feel" layer)
- **Points**: credits fly to the score pill with easing + count-up ticker; badge unlocks get a full-screen flourish.
- **Ratings**: card-swipe/stamp physicality on ProposalRate (springy transforms, not instant state flips).
- **Bridging**: when a cross-camp supporter rates your proposal, your lantern visibly brightens and blends colors — the core mechanic is *felt*, not just scored.
- **Countdown**: round timer as a burning fuse / candle motif, urgency color shift in the last 60s.
- **Transitions**: stage changes are camera moves across the map (CSS scroll/transform choreography), never hard cuts.
- **Sound** (Phase 6, off by default, teacher toggle): subtle UI ticks, round-start horn, success fanfare.
- Typography/iconography: era-flavored display face for headings (Hebrew + Latin coverage, e.g. Secular One / Suez One paired with a body face), parchment-and-ink texture accents, consistent 8-pt spacing grid.

A dedicated `docs/` design brief for agora (palette, type scale, motion durations/easings, map layer spec) is produced in Phase 1 alongside the tokens file, so every later phase builds on it.

## Data model (new, in `packages/shared-types/src/models/agora/`)

Valibot schemas + `InferOutput` types; timestamps in millis; weights/thresholds in `agoraConstants.ts` (shared so client can explain scoring). Add `Collections.agoraTopicPackages / agoraSessions / agoraParticipants / agoraScores / agoraValueAnswers` in `collectionsModel.ts` and `SourceApp.AGORA` in `models/engagement/SourceApp.ts`.

- **AgoraTopicPackage** — topic, language, status draft/ready, framing text, 2 × `AgoraCharacter` (name, role, portrait, arguments, values), positioning scale (left/right labels ↔ characters), challenge question, value answer key per character, plausibility rubric (weighted criteria), health-metric definitions, `AgoraScene[]` (kind: intro/timeTunnel/periodExplainer/perspectiveA/perspectiveB/successEnding/failureEnding; optional `videoUrl`, images, dialogue lines + text fallback), and `artwork` (map backdrop URL, per-location vignette URLs, character portrait URLs — AI-generated or teacher-replaced).
- **AgoraSession** — join `code` (6 chars), topicPackageId, teacherId, `rootStatementId`, `challengeQuestionId`, `deviceMode: individual|team`, `stage` (lobby → framing → perspectives → valueIdentification → positioning → deliberation → results → ended), `roundNumber`, `roundPhase: propose|rate|improve`, `roundEndsAt`, `lessonEndsAt`, participantCount, status, embedded `AgoraClassScore` at the end. Rounds are fields on the session doc — a 45-minute lesson needs no rounds collection.
- **AgoraParticipant** (doc id `${sessionId}--${uid}`) — anonName (auto-generated), teamMemberCount, `campPosition` 0–100 + derived `camp: left|right|center`, valueScores, points `{valueAccuracy, proposals, helping, total}`.
- **AgoraProposalScore** (doc id = proposal statementId; **function-written only**) — authorCamp, per-camp aggregates `{sum, n, positiveN}`, `bridgingScore` 0–100, plausibility `{score, criterionScores, reasoning}`.
- **AgoraValueAnswer** (doc id `${sessionId}--${uid}--${characterId}`) — free-text answer, AI score/feedback/matchedValueIds.

**Statement mapping**: session root = `question` Statement; challenge question = child; student proposal = `option` Statement (creator = anonName) stamped with `agoraSessionId`; rating = Evaluation (deterministic id `${uid}--${statementId}`) stamped with `agoraSessionId`; improvement suggestion/comment = child Statement of the proposal with `suggestionStatus: open|accepted|thanked`. Camp is **never** stored on the evaluation — the trigger reads it server-side (anti-spoof).

**Rules**: `firestore.rules` — topicPackages (write: creator), sessions (stage/round updates: teacher), participants (create via callable, read own + teacher), `agoraScores` **client-write: false** (admin SDK only), valueAnswers (create/read own). `storage.rules` — `/agora/{topicPackageId}/**`, video ≤ ~300MB / images ≤ 5MB via constants.

## Camp-aware bridging score

New **separate** trigger `functions/src/agora/onAgoraEvaluation.ts` (`onDocumentWritten` on evaluations) — do NOT modify the shared `onCreateEvaluation.ts`. First-line guard: return unless `evaluation.agoraSessionId` exists. Then:
1. Read evaluator's participant doc → camp (server-authoritative).
2. Transactionally update `agoraScores/{statementId}` per-camp aggregates from the event's before/after diff.
3. `bridgingScore = 100 × (SAME_W × S_own + CROSS_W × S_other × min(1, n_other/MIN_CROSS_RATERS))` with `CROSS_W > SAME_W` (start 0.65/0.35, `MIN_CROSS_RATERS = 3`); center-camp raters count toward both camps at half weight. All weights in `agoraConstants.ts`.
4. On first threshold crossing, `awardCredit` (`functions/src/engagement/credits/creditEngine.ts`) + increment participant points.

Generic consensus (`agreementIndex`) still comes from the existing pipeline and feeds the class "max consensus" component.

## Cloud Functions inventory (`functions/src/agora/`)

| Function | Kind | Purpose |
|---|---|---|
| `agoraGenerateTopicPackage` | onCall | Topic + language → `callLLM` (heavy model `gpt-4o`, jsonMode, `extractJson`) → full draft package. Pattern: `fn_popperHebbian_analyzeFalsifiability.ts` structured-JSON-with-fallback. **Must include a deterministic fixture mode when `OPENAI_API_KEY` is absent** (emulators/e2e/CI — fixture returns the hand-made French Revolution package + asset pack). |
| `agoraGenerateArtwork` | onCall | Topic package → OpenAI Images API (`gpt-image-1`), style-locked prompt template → map backdrop, location vignettes, 2 character portraits; uploads to Storage, writes URLs onto the package. Called from TopicWizard after text generation; TopicEditor can regenerate per-image. Fixture mode returns the bundled asset pack URLs. |
| `agoraCreateSession` | onCall | Teacher: session doc + root/challenge Statements + unique join code. |
| `agoraJoinSession` | onCall | Student: code → participant doc (anon name; team member count), increment participantCount. |
| `agoraAdvanceStage` | onCall | Teacher-only stage/round transitions; round-end triggers plausibility batch + "new round" notifications. |
| `agoraGradeValueIdentification` | onCall | Answer + answer key → fast model (`gpt-4o-mini`) `{score, matchedValueIds, feedback, confidence}`; writes valueAnswer grading + `awardCredit`. Graded **async** — student proceeds; feedback arrives via participant-doc listener. |
| `agoraWritingAssistant` | onCall | Wraps existing `improveSuggestion` + `checkForInappropriateContent` (`functions/src/services/ai-service.ts`) with an agora system prompt ("challenge the student to sharpen historical reasoning"). |
| `agoraScorePlausibility` | onCall | Round-end batch: all round proposals vs rubric in ONE heavy-model call → written into `agoraScores`. |
| `agoraSimulateHealthMetrics` | onCall | Leading proposal + metric defs → simulated deltas + narrative onto session doc. |
| `agoraComputeClassScore` | onCall | Max agreementIndex + Σ personal points + avg plausibility → `AgoraClassScore`, success vs threshold. |
| `onAgoraEvaluationWritten` | trigger | Bridging score engine (above). |
| `onAgoraSuggestionResolved` | trigger (statements update) | Suggestion marked accepted/thanked → `awardCredit` to suggester, points.helping++, write `inAppNotifications` doc. |
| `onAgoraProposalCreated` | trigger (statements create) | Guarded by `agoraSessionId`: moderation, init `agoraScores` with authorCamp. |
| `agoraSessionSweep` | onSchedule hourly | Auto-end sessions past `lessonEndsAt` (pattern: `fn_handleVotingDeadline.ts`). Phase 6. |

Conventions: `logError` with context everywhere, no `any`, constants not magic numbers, `createTimestamps`/millis. **Proposal sampling is client-side** (a class has ≤ ~40 proposals): fetch all for the challenge question, exclude own + already-evaluated (query evaluations by evaluatorId + parentId, as flow does), shuffle, take N — MC's Thompson sampling is unnecessary at this scale.

## App structure (`apps/agora`)

Clone flow's conventions (`apps/flow`: vite.config.ts PWA setup, `src/lib/firebase.ts`, `user.ts`, `i18n.ts`, `engagement.ts`, `scripts/seed.ts`; QR + callable wrappers from `apps/join`).

```
apps/agora/
  package.json          # @freedi/shared-types, engagement-core, shared-utils, shared-i18n, firebase, mithril, qrcode; port 3009
  vite.config.ts        # flow's config + CacheFirst runtimeCaching for firebasestorage videos; RTL manifest
  scripts/seed.ts       # emulator seeder: demo topic package + session + synthetic participants/evaluations
  src/
    index.ts            # routes: / (home), /join/:code, /play/:sessionId (GameController stage machine),
                        # /teach, /teach/new (TopicWizard), /teach/topic/:id (TopicEditor), /teach/session/:id (LiveDashboard)
    lib/                # firebase.ts (+functions me-west1 +storage +emulator wiring), user.ts (anon student / Google teacher),
                        # i18n.ts (he default, RTL), callables.ts (typed wrappers), session.ts (onSnapshot listeners),
                        # game.ts (stage machine), topic.ts (CRUD + Storage uploads), proposals.ts (propose/rate/suggest),
                        # notifications.ts (inAppNotifications toast listener), engagement.ts (copy of flow's)
    views/              # Home, JoinSession, Lobby, Framing, Perspectives, ValueIdentification, Positioning,
                        # ProposalWrite (+AI assistant), ProposalRate, ProposalImprove, MyProposal (per-camp support + bridging),
                        # RoundResults (health metrics), ClassOutcome (ending video + score breakdown),
                        # teacher/ TeacherHome, TopicWizard, TopicEditor, SceneVideoUpload, LiveDashboard
    components/         # EraMap (2.5D SVG/CSS map hub: layers, markers, lanterns, camera moves — renderer-swappable),
                        # VideoScene (video w/ dialogue fallback), CountdownTimer (fuse motif), CampScale, PointsPill (fly-to + ticker),
                        # BadgeFlourish, Toast, QRShare, LanguagePicker
    styles/             # tokens (era palette, type scale, motion durations/easings) / global / components scss,
                        # logical properties for RTL, prefers-reduced-motion honored everywhere
```

Also: hosting target `agora` in `firebase.json`/`.firebaserc`, root `deploy:agora` script (clone of `deploy:flow`).

## Session realtime model

- **Join**: LiveDashboard shows QR (`/join/<code>`) + 6-char code. Team mode asks "how many at this device? (1–3)".
- **Advance**: teacher-controlled, timer-assisted. Session doc is the single source of truth (`stage`/`roundPhase`/`roundEndsAt`); students hold one `onSnapshot` on it and re-route instantly. Countdown expiry soft-locks inputs client-side; only `agoraAdvanceStage` actually moves the session.
- **Listeners per student** (small fan-in): session doc, own participant doc, proposals query (`topParentId == rootStatementId && type == option`), own `inAppNotifications`, own proposal's `agoraScores` doc. Teacher adds participants + agoraScores collection listeners.

## In-app notifications

- Game events ("suggestion on your proposal", "suggestion accepted", "new round") → write **`Collections.inAppNotifications`** docs directly from agora functions with `sourceApp: SourceApp.AGORA` (schema already supports this — verified in `packages/shared-types/src/models/notification/Notification.ts`); client consumes via one `onSnapshot` toast listener. No new infra.
- Credits/badges/levels → already flow through `functions/src/engagement/` once `awardCredit`/evaluation tracking runs; surface with flow-style engagement listener + CreditFeedback-style components.
- No push/email in v1 (classroom, app open).

## Phases

**Phase 1 — Plan doc, scaffold, design system, types, session join.** Commit the detailed plan to **`plans/agora-deliberative-game-plan.md`**; write the agora design brief (era palette, type scale, motion spec, map layer spec) + `styles/tokens.scss`; hand-made French Revolution asset pack (map backdrop, vignettes, portraits) as demo/fixture content; shared-types agora models + Collections + SourceApp.AGORA + agoraConstants; apps/agora scaffold; `agoraCreateSession`/`agoraJoinSession`/`agoraAdvanceStage`(lobby→framing); Lobby with live participant list rendered **on the EraMap v1** (backdrop + anonymous markers appearing as students join); QR/code join; device-mode picker; firestore/storage rules; hosting target; seed script. *Verify*: typecheck/lint in shared-types+functions+apps/agora; emulators (auth 9099, firestore 8081); teacher browser creates → incognito student joins → marker pops onto the map live. Early check: anon participant can create statements under the session root with real rules in the emulator.

**Phase 2 — Teacher authoring + AI topic package + artwork.** `agoraGenerateTopicPackage` + `agoraGenerateArtwork` (+ fixture modes), TopicWizard (topic → text package → artwork, with progress states), TopicEditor (every field editable, per-image regenerate/replace), SceneVideoUpload with progress, dialogue fallback editor, `status: ready` gate. *Verify*: real key: "המהפכה הצרפתית" → full Hebrew package + consistent-style artwork set; edit+save; mp4 upload persists; fixture mode stable without key; valibot-parse unit tests on LLM output.

**Phase 3 — Game flow on the map: framing → perspectives → values → positioning.** GameController stage machine driven by camera moves on the EraMap (portal arrival, palace/assembly visits, bridge positioning), VideoScene fallback, ValueIdentification + AI grading + feedback + points (PointsPill fly-to), Positioning = placing your marker on the bridge → camp, teacher stage controls. *Verify*: two-browser walk, stage transitions are smooth camera moves and switch <1s; AI score + points land on participant doc; `prefers-reduced-motion` path renders static; playwright e2e with fixture mode (explicit waits, **never `networkidle`**).

**Phase 4 — Deliberation loop + bridging (the core).** The town-square stage of the map: proposals appear as **idea lanterns** (brightness = consensus, color blend = cross-camp support); ProposalWrite + writing assistant, proposal statements with `agoraSessionId`, client-side rating batches with card-swipe/stamp physicality, evaluations, `onAgoraEvaluationWritten` + agoraScores, ProposalImprove suggestions, accept/thank + credits + notifications, MyProposal per-camp view (your lantern up close), rounds with `roundEndsAt` (fuse countdown). *Verify*: seeded 3 participants across camps — cross-camp positive rating moves bridgingScore more than same-camp (pure-formula unit test in shared-types + emulator integration) and visibly brightens/blends the lantern; existing `agreementIndex` pipeline unaffected; accept fires credit + notification doc.

**Phase 5 — Scoring, endings, reactive map, teacher dashboard.** Plausibility batch, health-metrics simulation, RoundResults, `agoraComputeClassScore`, ClassOutcome — the **map itself transforms** (prosperity vs smoke/fire layers) per health metrics, then the success/failure ending video plays over it; full LiveDashboard (stage progress, camp distribution, consensus leader, anonymous leaderboard, projector-friendly class map view). *Verify*: seed-script lesson simulation → class score computed; threshold boundary unit-tested both sides (correct ending + map state on each side); dashboard matches Firestore.

**Phase 6 — Juice, engagement polish, sound, PWA/Capacitor readiness, e2e + deploy.** Badge unlock flourishes, count-up tickers, optional sound layer (off by default, teacher toggle), agora credit rules seeded (defaultCreditRules pattern), badges/levels surfaced, toast center, `agoraSessionSweep`, PWA offline shell + video/artwork CacheFirst + lobby-stage preloading, RTL/accessibility pass (WCAG AA, reduced-motion), e2e suite `e2e/agora/` (webServer 3009), `deploy:agora` + `npm run deploy:f:dev -- <agora fns>`. *Verify*: check-all green; full e2e green on emulators; deploy to dev project; he-RTL mobile smoke; PWA installability; Lighthouse perf on a mid-range device profile.

## Risks / open questions

1. **LLM latency/cost**: 30+ simultaneous grading calls — use gpt-4o-mini, grade async, batch plausibility (one call per round).
2. **Fixture mode is a hard requirement** for emulator/e2e/CI — designed in from Phase 2.
3. **Center-camp semantics** (half-weight both camps) and camp mutability after positioning — needs Tal's sign-off during Phase 4.
4. **Teacher de-anonymization**: dashboard shows anon names only — confirm teachers shouldn't map names to students for grading.
5. **Evaluations coupling**: agora evals run the full existing pipeline (polarization, embeddings, stats) — load-test a seeded 35-student session; add a source short-circuit if noisy (the trigger has a `source === 'sign'` precedent).
6. **Video weight on school Wi-Fi**: ≤720p guidance, CacheFirst, lobby preloading, first-class dialogue fallback.
7. **Team-mode device swap mid-lesson** orphans the team — accepted for v1, documented for teachers.
8. **shared-i18n is react/next-oriented** — local flow-style dictionary for game strings, importing only language metadata; flagged as tech debt.
9. **Artwork generation cost/consistency**: `gpt-image-1` per-topic asset sets cost real money and style drift is possible — style-locked prompt template, teacher regenerate/replace per image, and the bundled French Revolution pack as guaranteed-quality fallback. If image quality disappoints, fall back to a curated stock/illustration pack per era.
10. **Map performance on old school hardware**: SVG/CSS layers chosen over a canvas engine precisely for this; test on a throttled mid-range profile in Phase 3; PixiJS swap path kept open behind the `EraMap` interface.

## Key files to reuse (verified)

- `functions/src/config/openai-chat.ts` — `callLLM` + `extractJson` (the LLM primitive)
- `functions/src/services/ai-service.ts` — `improveSuggestion`, `checkForInappropriateContent`
- `functions/src/chat/scorerV1.ts` / `functions/src/fn_popperHebbian_analyzeFalsifiability.ts` — structured-JSON grading patterns
- `packages/shared-types/src/utils/consensusCalculation.ts` — wizcol consensus engine (untouched, reused)
- `functions/src/evaluation/onCreateEvaluation.ts` — existing pipeline the bridging trigger coexists with
- `functions/src/engagement/credits/creditEngine.ts` — `awardCredit`
- `apps/flow/src/lib/{deliberation,engagement,firebase,user,i18n}.ts` + `apps/flow/scripts/seed.ts` — Mithril app template
- `apps/join` — QR + typed callable wrapper patterns
- `functions/src/fn_handleVotingDeadline.ts` — scheduled sweep pattern
