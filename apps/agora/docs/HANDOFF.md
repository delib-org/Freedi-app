# Agora — Working Handoff

**Start-here document for continuing work in a fresh chat.** Last updated
2026-07-14, branch `dev` (this iteration's agora work was done on
`main-sign` and merged into `dev` at 500fa7777 — both carry it).
Companion docs: `game-script.md` (the pedagogical
script — what each beat teaches and why, grounded in Tal's book *On
Deliberation*), `stitch-brief.md` (Google Stitch prompts for the workshop
redesign, DONE), `../DESIGN.md` (⚠️ STALE: still describes the old
Era-of-Lanterns night theme — superseded by the Festival Day theme below),
`plans/agora-deliberative-game-plan.md` (original architecture plan).

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
**deliberation: 5 self-paced laps** of *my proposal → rate 3 → help someone*
→ results.

Key deliberation mechanics (Stitch workshop redesign implemented 2026-07-13 —
"mine" and "help" share ONE skeleton: scoreboard → proposal on the table →
tabbed work area). **Mine | Others tabs** (`delib-nav`: fixed bottom bar on
mobile ≤700px, top tab row on desktop) let the student move freely between
their own workshop and classmates' proposals: "Mine" during rate/help is a
PEEK (lap progression untouched, badge shows unseen open suggestions);
"Others" from the mine step advances to rating; after all laps it means
"keep helping". Hidden on lap 1 until the first proposal is written.
- **My proposal workshop** (flattened 2026-07-13, Tal's request — no tabs):
  scoreboard panel (camp columns + bridge-power meter) → my proposal in an
  ALWAYS-EDITABLE box inside the gold card (live text pre-filled; "Update
  proposal" enabled only when changed, celebrates + verdicts go stale) →
  "suggestions received" stream directly under it, newest first, with
  "I'll implement / Thanks / No thanks" (declined — quiet, no points;
  accepting celebrates the suggester with a glitter popup; the edit box is
  right above for weaving the idea in) → ask-the-characters buttons
  (in-character AI verdicts, score 0–100 + advice; their rating enters the
  REAL evaluation pipeline as 3 camp raters each; stale after edit → "text
  changed") → collapsible needs board.
  **Pedagogy rule (Tal, 2026-07-13): the AI never WRITES for students** —
  the improve-my-wording and phrase-my-suggestion buttons were removed
  ("otherwise they will not think"). Instead: `agoraEstimateReception`
  callable — an on-demand, NUMBERS-ONLY reception forecast (per-camp 0-100
  support + predicted average, fixture = needs-keyword overlap) shown under
  the edit box; goes stale when the text changes. AI opinions/critique live
  only in the in-character reviews. `agoraWritingAssistant` still deployed
  but no longer called by the client (keep in source or deploys will demand
  a functions:delete).
- **The collaboration loop (2026-07-13)**: helper B and owner A iterate.
  B's sent suggestions live in a "Proposals I helped" section (help step +
  done screen): live status chips (the acknowledgment), the proposal's
  CURRENT text with an "improved since your idea" marker (compared against
  suggestion.createdAt — NOT lastUpdate, which resolution bumps), an inline
  compact re-rate scale (overwrites the evaluation; the onWrite bridging
  trigger diffs before/after) and a FREE follow-up box (no lap advance).
  B gets a local toast + an Others-tab badge when a helped proposal is
  edited (client-side detection, sessionStorage watermark — no backend).
  A sees an AGGREGATE-ONLY "N ratings updated since your last improvement"
  line in the scoreboard (studentEvalTimes from ONE session-wide
  evaluations listener; AI raters excluded via isAgoraAiUid; individual
  votes stay anonymous by design — Tal's decision).
- **Rate**: five-level emoji scale (−1…+1 half steps), least-rated-first
  candidate ordering with per-student tiebreak, 3 per lap.
- **Help**: same skeleton — their scoreboard, NEUTRAL hero card ("Proposal
  by <anon>" + ↻ next proposal), tabs [My suggestion | AI help | Needs];
  suggestion tab asks "How could this proposal serve BOTH camps better?",
  AI help = phrase-my-suggestion. One suggestion per lap,
  fewest-open-suggestions targets first.
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
  router + world strip), `views/Deliberation.ts` (the cycle; cycle state in
  sessionStorage `agora_{sessionId}_cycle`), `views/teacher/TeacherSession.ts`,
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
  unkeyed siblings — pass the map as a nested array. Symptom: frozen DOM /
  silent redraw crash. Hit 3×.
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
7. Ops: agora functions/hosting not yet deployed anywhere (emulator only);
   `wizcol-agora` hosting site must be created before first deploy.

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
