# Agora — Working Handoff

**Start-here document for continuing work in a fresh chat.** Last updated
2026-09-01.

Companion docs: `../CLAUDE.md` (the rules of the road — read that first),
`feedback-cycle.md` (the improvement loop, and the spec `e2e-cycle.mjs`
asserts against by name), `game-script.md` (the pedagogical script, grounded
in Tal's *On Deliberation*), `../DESIGN.md` (Purple Agora — current, and what
the contrast auditor enforces), `chat-guide-rules.md` (ARCHIVED: describes the
chat deliberation, deleted 2026-08-16).

**Status: live.** https://agora-wizcol.web.app on project `wizcol-app` —
hosting, 13 functions, rules and 5 indexes deployed, demo topic seeded.
No class has played it yet.

## What Agora is
  
A classroom deliberation game (`apps/agora`, Mithril + Vite SPA, Hebrew-first
RTL, port 3009). A teacher sends the class "through a time tunnel" to a
historical crisis (demo: French Revolution 1789). Students meet two opposing
characters, hear their positions, then their *needs* (the pedagogical pivot),
position themselves between the camps, and deliberate: propose solutions,
rate others, improve each other's ideas — aiming for a solution both camps
can live with. Cross-camp support ("bridging") is worth ~2× same-camp.
Grounded in Tal's deliberative theory: needs vs. positions, criticism as
service, expanding agreement, honest disagreement as an achievement.

## Current game flow (as implemented)

**Teacher** (`/teach`): Google sign-in → pick a ready topic package → open
session (join code + QR stay on the board through ALL stages for latecomers)
→ advance stages with one button: lobby → framing → perspectives → needs →
positioning → deliberation (auto-starts, no round management) → results.
A **class-progress card** (per-student chips) shows who finished the current
stage's self-paced steps — scene stages read `participant.stageProgress`
(written by SceneStage via `reportStageProgress`), positioning reads
`campPosition`, deliberation reads "has a proposal" — so the teacher knows
when to advance. Participant count is students only (AI raters filtered).

**Student** (`/join/<code>`, anonymous): lobby (marker on the era map) →
scenes (framing/perspectives/needs, self-paced, dialogue reveals) → **needs
board** (both characters' needs side by side; reachable later via one tap
everywhere) → positioning (slider labeled with character names + camp) →
**deliberation: the personal-lap square** (`views/Deliberation.ts` — propose →
weigh a few classmates' → help someone, in laps; ownership said
conversationally) → results.

Key deliberation mechanics (NOTE: the "chat-guided square" described below was
REVERTED on 2026-08-05 and its code deleted on 2026-08-16 — the places UI is
what ships. Kept for the reasoning; see feedback-cycle.md for what runs. The
"places" UI (placeBanner scenes, shell washes, travel splashes, delib-nav
tabs, the 5-lap cycle) is GONE; students still couldn't reliably separate
"mine" from "others", so ownership is now stated CONVERSATIONALLY. A
scripted guide persona (🦉, `chat.guide_name`, i18n templates with rotating
phrasings — NOT AI-generated) drove `views/DeliberationChat.ts` (deleted):
1. intro → proposal composer (needs board one tap away),
2. thanks → deals classmates' proposals ONE AT A TIME as rate cards, each
   verbally framed "a classmate's 📙 + number"; the student's echoed
   words/ratings sit in blue --mine bubbles on their side,
3. any rating below +1 (everything except 😍) → "how could it improve?"
   quick-reply → optional improvement composer (this is now the main path
   into helping; there is no separate help lap),
4. after a soft goal of 3 ratings (guided opening auto-deals) → the MENU:
   rate more (live count) / what my proposal received (badge = open
   suggestions) / improve mine / ask the characters (stale dot) / proposals
   I helped (change badge) — options appear conditionally, plus one nudge
   line (priority: opening ratings → fresh feedback → unasked characters →
   under-rated proposals → generic).
Engine was `lib/chatFlow.ts` (deleted with the view; its lesson — a pure
state machine, no Mithril/Firestore, tested in node — survives as
`lib/flows/deliberationFlow.ts`, which runs the shipping square's laps) —
module singleton, sessionStorage persistence
(`agora_{sessionId}_chatflow` + `_chatlog`, transcript stores i18n KEYS so
a language switch re-renders the whole log; resolved variant keys replay
the same phrasing after refresh). `state.dealtIds` guards against the
evaluations-snapshot lag re-dealing a just-rated proposal. Bootstrap waits
for `statementsLoaded && evaluationsLoaded` (new flags in proposals.ts);
with no stored chat but an existing proposal → "welcome back" straight to
the menu. Cards in the transcript persist only REFS and re-render from
live state (old cards inert via `.chat-card--inert`, rate cards stay
readable with the chosen emoji highlighted). Typing indicator (550ms per
guide line, view-only, instant under reduced-motion), auto-scroll only
when already near the bottom. `JourneyStrip` + `StageTransition` +
`ScoreHud` unchanged (HUD step mapped from chat phase).
- **My proposal card** (menu → improve mine): my proposal in an
  ALWAYS-EDITABLE box (live text pre-filled; "Update
  proposal" enabled only when changed, celebrates + verdicts go stale).
  **My feedback card** (menu → my feedback): scoreboard panel (camp
  columns + bridge-power meter + aggregate ratings-moved line) →
  "suggestions received" stream, newest first, with
  "I'll implement / Thanks / No thanks" (declined — quiet, no points;
  accepting celebrates the suggester with a glitter popup; the edit box is
  right above for weaving the idea in) → ask-the-characters buttons
  (in-character AI verdicts, score 0–100 + advice; their rating enters the
  REAL evaluation pipeline as 3 camp raters each; stale after edit → "text
  changed") → collapsible needs board.
  **Pedagogy rule (Tal, 2026-07-13): the AI never WRITES for students** —
  the improve-my-wording and phrase-my-suggestion buttons were removed
  ("otherwise they will not think"). AI opinions/critique live only in the
  in-character reviews. The numbers-only reception forecast
  (`agoraEstimateReception`) was ALSO removed from the client (Tal,
  2026-07-28 — it duplicated the character reviews' scores); the callable
  plus `agoraWritingAssistant` remain deployed but uncalled (keep both in
  source or deploys will demand a functions:delete).
- **The collaboration loop (2026-07-13)**: helper B and owner A iterate.
  B's sent suggestions live in the "Proposals I helped" menu branch: live
  status chips (the acknowledgment), the proposal's
  CURRENT text with an "improved since your idea" marker (compared against
  suggestion.createdAt — NOT lastUpdate, which resolution bumps), an inline
  compact re-rate scale (overwrites the evaluation; the onWrite bridging
  trigger diffs before/after) and a FREE follow-up box.
  B gets a local toast + a menu badge when a helped proposal is
  edited (client-side detection, sessionStorage watermark — no backend).
  A sees an AGGREGATE-ONLY "N ratings updated since your last improvement"
  line in the scoreboard (studentEvalTimes from ONE session-wide
  evaluations listener; AI raters excluded via isAgoraAiUid; individual
  votes stay anonymous by design — Tal's decision).
- **Rate**: five-level emoji scale (−1…+1 half steps), least-rated-first
  candidate ordering with per-student tiebreak (now `lib/squareOrder.ts`);
  the guided opening asks for 3, then rating continues
  through the menu while candidates remain.
- **Helping** now happens through the improvement prompt after a
  below-top rating ("How could this proposal serve BOTH camps better?" +
  don't-attack hint) and through follow-ups in the helped branch.
- **Results**: three outcomes — success / honest disagreement (dignified
  "dusk" map + achievement framing) / collapse — plus a warm AI class
  debrief (what went well / what to try next time). Class score = 0.45
  bridging + 0.25 points + 0.3 plausibility, threshold 70.

**Game feel — "Festival Day" theme (2026-07-13, replaced Era-of-Lanterns
night look)**: light, playful, for ages 12-15. Day-sky page background with
cloud puffs + a 5-hue sparkle field; white cards, navy ink text;
"candy-press" buttons (solid ledge underneath, squashes on tap); the era map
is a sunny meadow scene (sun, sand plaza, purple-pennant palace, teal-roof
assembly); rating emojis wiggle on hover; done-pips are little suns;
celebration confetti bursts in all five theme hues. A panoramic world-strip
of the era map still crowns every in-game screen; HUD with 5 lap-pips +
step chips + fuse + points.

**Ownership identity system (2026-07-13/14, playtest-driven — students
couldn't tell "mine" from "others")**: BLUE = MINE (📘), ORANGE = A
CLASSMATE'S (📙), used consistently everywhere: card ribbons
(`border-inline-start`, RTL-safe), owner chips (`.owner-chip--mine/--peer`
with `delib.owner_mine`/`delib.owner_peer` labels), delib-nav active tabs
(Mine=blue / Others=deep orange `#b05e0d` for AA), an ambient fixed
3px mode strip (`.shell--mode-mine/--mode-peer` sets `--mode-accent`),
mobile bottom-bar edge, scoreboard chips, the rate card (chip + proposal
number), helped items, suggestion-stream items, and even map dots
(my idea-dot blue, classmates' orange). CRITICAL COLOR RULES: camps are
royal purple (`--camp-left`) vs teal (`--camp-right`) and must NEVER share
hues with ownership blue/orange; notification badges are danger-red, never
a camp color. Tokens: `--lantern*` values were REDEFINED to the mine-blue
family (name kept — ~100 usages mean "primary accent = mine");
`--mine*`/`--peer*` aliases exist for new ownership CSS. Every `*-glow`
token now holds the DARK text-safe shade of its family (light-theme role
flip); all pairs measured WCAG AA. Anonymity unchanged: proposals by
number, never names.

## Architecture cheat-sheet

- **Client**: `apps/agora/src` — `views/GameController.ts` (student stage
  router + world strip), `views/Deliberation.ts` (the square: my proposal /
  the market / helped threads) + `lib/flows/deliberationFlow.ts` (pure lap
  state machine; cycle state in sessionStorage) + `views/ThreadChat.ts`
  (per-helper threads), `views/teacher/TeacherSession.ts`,
  `lib/session.ts` (single session+participants listener; **filters `isAI`**),
  `lib/proposals.ts` (deliberation listeners + writes), `lib/celebration.ts`
  + `components/Celebration.ts`, `components/NeedsBoard.ts`, `components/EraMap.ts`
  (svg map; `crop:'bottom'` for the strip), local i18n dicts in `lib/i18n.ts`
  (6 languages — every new string goes into ALL of them).
- **Functions**: `functions/src/agora/` — `fn_agoraCharacterReview.ts`
  (in-character review + 3 synthetic raters per character, uids
  `agora-ai--{charId}--{1..3}`, seeded as `isAI` participants at session
  creation), `fn_onAgoraEvaluation.ts` (bridging trigger, camp read
  server-side), `classScore.ts` (results batch: plausibility + health
  metrics + outcome rule + debrief), `fixtureTopicPackage.ts` (deterministic
  French-Revolution package when `OPENAI_API_KEY` absent).
- **Shared types**: `packages/shared-types/src/models/agora/` — constants
  (`AGORA_CYCLE`, `AGORA_AI_REVIEW`, `AGORA_OUTCOME`…), `agoraOutcome.ts`
  (pure outcome rule, unit-tested), `agoraCharacterReview.ts`,
  `agoraBridging.ts`. Proposals/ratings reuse `statements` + `evaluations`
  (deterministic eval ids `${uid}--${statementId}`); evaluations MUST carry
  the `evaluator` object or the shared pipeline throws.

## How to run / verify

**Start here: `npm run fast`.** It builds a session that is ALREADY at the
stage you want — bot classmates enrolled, positioned across both camps, their
proposals posted — and prints a join URL you can open in any browser. ~4
seconds, versus the minutes it takes to click a teacher and two students
through framing → perspectives → needs → positioning to reach the same screen.

```bash
npm run fast                              # deliberation, 4 classmates, 3 proposals → join URL
npm run fast -- --stage=positioning       # any stage
npm run fast -- --open --mine --shot=x    # drive a student there, give them a proposal, screenshot
npm run fast -- --open --keep --lang=en   # leave a real browser open to poke at
```

`--mine` matters: the classmates' side (rate / feedback / helped) is gated
behind having written your own proposal, so without it most of the
deliberation is unreachable. Flags: `--students`, `--proposals`, `--position`,
`--lang`, `--mobile`, `--no-seed`.

Every script here now starts with `preflight()` (`scripts/lib/preflight.mjs`),
which checks the emulators, the functions bundle, vite and the seed BEFORE
doing any work — and auto-seeds when the topic package is missing. A stack
problem now fails in seconds with the command that fixes it, instead of
surfacing minutes later as an unrelated-looking stack trace. Run it alone with
`npm run preflight`.

For the full honest path (real UI, every stage, assertions), it is still
`node scripts/walkthrough.mjs` — fastlane skips SETUP, never the thing under
test.

1. Emulators (auth 9099, firestore 8081, functions 5001) — usually already
   running from the repo root; functions hot-reload after
   `cd functions && npm run build`. `functions/.env` HAS an OpenAI key →
   real AI; remove env to get deterministic fixtures.
2. Dev server: `cd apps/agora && npx vite --port 3009` (detach with
   nohup if a background task might be killed).
3. Seed demo topic: `FIRESTORE_EMULATOR_HOST=localhost:8081 npx tsx scripts/seed.ts`.
4. **Full e2e**: `node scripts/walkthrough.mjs` — drives teacher + 2 students
   through the whole game via the real UI with assertions + screenshots into
   `walkthrough-shots/`. Let vite settle a few seconds after source edits
   before running (cold-transform race); the script retries teacher-home once.

## Gotchas (hard-won)

- **Mithril keyed fragments**: never spread `...list.map(keyed)` among
  unkeyed siblings. Symptom: the whole screen goes blank mid-redraw
  ("In fragments, vnodes must either all have keys or none have keys"),
  which reads as a data bug — the ClassPicture went blank for a whole
  session this way, because the empty state has no keys and so nothing
  fails until the FIRST row appears. Hit 4×. The reliable fix is a
  wrapper element around the keyed children (`m('.thing-list', items.map(…))`),
  not a nested array in place — the wrapper also gives the group somewhere
  to hang its own spacing.
- Stale browser tabs after code changes look like data bugs (e.g. teacher
  showing 8 participants = 6 AI raters unfiltered by old JS). Hard-refresh.
- **PWA service worker poisoning (2026-07-13)**: a production-build SW once
  registered on localhost:3009 serves its stale precache FOREVER (dev
  changes "never arrive", even across restarts — teacher saw removed
  stages). Fixed twice over: dev server serves a kill-switch /sw.js
  (vite.config plugin) and src/index.ts unregisters SWs in dev. One plain
  reload heals a poisoned browser.
- **Firestore emulator OOM**: after ~a day of walkthrough runs the java
  emulator hits `OutOfMemoryError: Java heap space` — browsers time out
  ("offline mode") while curl still answers, export fails. Rescue small
  collections via REST (`Authorization: Bearer owner`), restart emulators
  (`firebase emulators:start --only hosting:dev,firestore,auth,functions,storage,database
  --project freedi-test` — the --project flag matters if the shell's active
  project is wizcol-app), PATCH the docs back, re-run seed. Sessions/auth
  users are wiped; topic packages are the only data worth rescuing.
- AI-rater pollution: any student-facing count/metric must filter
  `participant.isAI` / `isAgoraAiUid(evaluatorId)` (outcome stats do).
- With 2 students, honest-disagreement is mathematically unreachable
  (needs ≥2 proposals rated by BOTH camps); fine for real classes.
- Emulator REST list calls need `?pageSize=300` once data accumulates.
- Dialogue scenes need the '···' reveal clicks before the continue button.
- **`signInWithRedirect` can never finish on agora-wizcol.web.app
  (2026-08-26)**: the redirect handler runs on `wizcol-app.firebaseapp.com`
  and leaves the credential in THAT domain's storage; the app reads it back
  through a hidden iframe there, which third-party storage partitioning hands
  an empty store. `getRedirectResult()` resolves to null, so the teacher
  watches Google's screen take over the tab and lands back signed out.
  Reported from production as "the Google screen appeared again in the main
  window and pressing it did nothing". Popup is unaffected (it postMessages
  the credential home and needs no storage). Never make redirect a fallback
  here — `canCompleteRedirectSignIn()` in `lib/firebase.ts` guards it.
- **A returning teacher's link ALWAYS fails**: their Google identity is
  already its own account, so `linkWithPopup` on today's anonymous visit
  throws `auth/credential-already-in-use`. That is the normal path, not an
  edge case. The error carries the credential (`linkWithPopup` sends
  `returnIdpCredential: true`, so the backend answers 200 + errorMessage +
  `oauthIdToken`), so `GoogleAuthProvider.credentialFromError()` →
  `signInWithCredential()` finishes it with no window and no user gesture.
  Note `linkWithCredential` does NOT send that flag, so a probe built on it
  gets `credentialFromError() === null` and misleads.

## Next steps (agreed direction)

1. ~~Workshop-screens redesign via Google Stitch~~ — DONE 2026-07-13 (shared
   skeleton, tabbed work area, unified feedback inbox, declined status).
   Not adopted from the Stitch export: sentiment-emoji rows on the help
   screen (rating stays its own step) and the fixed bottom nav.
2. ~~Mine-vs-others distinction~~ — DONE 2026-07-13/14 in two passes
   (ownership chips/ribbons, then the full Festival Day blue/orange
   re-theme). Worth a real-classroom re-test, incl. whether 📘/📙 emoji
   render on school Chromebooks (fallback pair if not: 💙/🧡).
3. **Update `../DESIGN.md`** — still documents the retired Era-of-Lanterns
   night direction; rewrite around Festival Day (palette + rules live in
   `src/styles/tokens.scss` comments and the HANDOFF game-feel section).
4. **Diverging camp bars** — show opposition (from baseline) vs support;
   "3 rated" with an empty bar currently hides active rejection (offered,
   not yet approved).
5. **Artwork generation** (`agoraGenerateArtwork`, gpt-image-1): painterly
   backdrops, character portraits, per-location vignettes — the biggest
   remaining "wow" upgrade; plan sketch in plans/agora-deliberative-game-plan.md.
   Prompts must now target the DAYTIME festival look, not night.
6. From the script's open questions: interactive needs check ("say it back
   until the Count agrees he's been understood"), teacher cards, narrator
   interstitials, evidence cards, bias-events deck, expanding-agreement
   (~80% net support) as the success verdict, two-lesson arc.
7. ~~Ops: agora functions not yet deployed anywhere~~ — DONE: 13 functions
   live on `wizcol-app` (see Status at the top).

### Deploying

The hosting site exists: **`agora-wizcol`** on project `wizcol-app`
(https://agora-wizcol.web.app), created 2026-08-14. Note the order of the
words — `.firebaserc` originally mapped the `agora` target to `wizcol-agora`,
which was never created, so the mapping was corrected to match the real site.

`.firebaserc` holds the target → site mapping and is gitignored, so a fresh
clone cannot deploy even after the site exists. Copy `.firebaserc.example`
(committed, same content minus anything machine-specific) to `.firebaserc`.

### A hot-reloaded functions emulator stops firing triggers

If Firestore triggers seem not to run — scores never appear, points never move —
check whether the functions emulator reloaded since the last one fired:

```bash
grep -c 'Beginning execution of "me-west1-onAgoraEvaluationWritten"' <emulator log>
grep 'Loaded functions definitions from source' <emulator log>
```

A `Loaded functions definitions from source` line AFTER the last execution means
the emulator hot-reloaded (any `npm run build` in functions/ will do it) and
quietly stopped dispatching background triggers. Callables keep working, which
makes it look like an app bug rather than an environment one.

The only fix is a full restart of the emulator suite. Measured either side of
one, on identical code: 10 writes/sec with zero triggers before, 2,417
writes/sec with every trigger firing after.

### Load smoke

`npx tsx scripts/load-smoke.ts [--students=30] [--proposals=10]` seeds a class,
has every student rate every proposal at once, and waits until each score
accounts for every rating it received. This is the "teacher says now rate them
all" case — the one where the trigger fan-out has to keep up.

Baseline 2026-08-16: 30 students, 10 proposals, 290 ratings accepted in 0.1s,
all scores settled 21.2s after the first write, nothing mis-counted.

### Indexes are NOT deployed by any script

`firestore.indexes.json` never reaches production on its own. `deploy:rules:prod`
deploys rules and storage only, and a plain `firebase deploy --only
firestore:indexes` would try to PRUNE the indexes that exist on wizcol-app but
not in the repo file — several of which other apps depend on. So indexes are
created surgically, one at a time:

```bash
gcloud firestore indexes composite create --project=wizcol-app \
  --collection-group=agoraSessions \
  --field-config=field-path=code,order=ascending \
  --field-config=field-path=createdAt,order=ascending
```

Agora's five (all created 2026-08-14, after a live session failed with
FAILED_PRECONDITION because none of them existed):

| collection | fields |
|---|---|
| agoraSessions | code + createdAt  ← blocks agoraCreateSession |
| agoraSessions | code + status |
| agoraSessions | status + lessonEndsAt  ← the hourly sweep |
| evaluations | agoraSessionId + evaluatorId |
| statements | agoraSessionId + statementType  ← the deliberation listener |

The last one backfills the whole statements collection and takes materially
longer than the others. Check state with:

```bash
gcloud firestore indexes composite list --project=wizcol-app
```

CI (`.github/workflows/agora.yml`) deliberately does NOT deploy: it runs lint,
typecheck, tests and build only. Deploying from CI would need a service-account
secret in GitHub, which nobody has set up, and the e2e scripts need an emulator
suite the workflow does not start.

## Recent commit trail (newest last)

Previous iteration:
- `62950a426` character reviews + three endings + debrief (+ evaluator-object fix)
- `460dbe14c` walkthrough script
- `0fb18696f` needs board + remove value-identification + scale labels
- `94881b35c` auto-start deliberation round
- `93fc41b6f` glitter celebrations
- `c07d9fd19` personal 5-lap cycles + pin always visible
- `ef5a13bd5` five-level rating scale
- `9122a0c83` my-proposal workshop redesign (UX-agent spec)
- `8f51a6f87` game-feel pass (world strip, HUD pips, stars, gold buttons)
- `0da1f7ac9` stale verdicts + improve-stays-on-screen
- `221c18c1c` Stitch brief

This iteration (2026-07-13/14, on `main-sign`):
- `7e18b7038` help screen — classmate's proposal + suggestion workshop in one box
- `6480732d0` collaboration loop findable — helped section on rate step, honest badge
- `3f6da4636` helped card order — proposal first, rate scale, then my ideas
- `d7b7bc084` proposals shown by number, not author name
- `67dea3b5b` characters judge by NEEDS with fair calibration
- `cfe9713ab` ownership identity v1 (gold lantern vs moon-silver scroll)
- `5e3ed9668` **"Festival Day" light re-theme — blue=mine / orange=classmate**
  (tokens rewrite, day sky, candy-press buttons, sunny EraMap, camps →
  purple/teal, 📘/📙 icons, WCAG-verified palette)
- `3504c7a35` removed accidentally-tracked .claude/worktrees gitlinks
