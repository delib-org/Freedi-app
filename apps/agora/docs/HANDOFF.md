# Agora — Working Handoff

**Start-here document for continuing work in a fresh chat.** Last updated
2026-07-13, branch `feat/dark-mode`. Companion docs: `game-script.md` (the
pedagogical script — what each beat teaches and why, grounded in Tal's book
*On Deliberation*), `stitch-brief.md` (Google Stitch prompts for the next
workshop-screen redesign), `../DESIGN.md` (Era-of-Lanterns art direction),
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
tabbed work area):
- **My proposal workshop**: scoreboard panel (camp columns side by side +
  bridge-power meter with big N/100 and gold spark), gold-glow hero card
  (own text + ✏️), then a tabbed workshop card [Feedback (badge = open
  suggestions) | AI help | Needs]. Feedback = ONE attributed inbox:
  character chips (the Count/Camille → in-character AI verdicts, score
  0–100, advice; their rating enters the REAL evaluation pipeline as 3 camp
  raters each; stale after edit → "text changed", re-ask primary) + peer
  suggestions with "I'll implement / Thanks / No thanks" (declined status —
  quiet, no points). Accept auto-opens editing (editor REPLACES the work
  area) and celebrates the suggester with a glitter popup. AI help tab =
  improve-my-wording (opens editor with coach draft) + coach note. Needs
  tab = the needs board. Improving your own proposal celebrates + stays.
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

**Game feel**: a panoramic world-strip of the era map (ground-anchored crop:
portal, traveler markers, live lanterns) crowns every in-game screen; HUD
with 5 lantern lap-pips + step chips + fuse + points; star-field sky;
beveled gold buttons; scene-title gold-diamond flourishes.

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
2. **Diverging camp bars** — show opposition (red, from baseline) vs support;
   "3 rated" with an empty bar currently hides active rejection (offered,
   not yet approved).
3. **Artwork generation** (`agoraGenerateArtwork`, gpt-image-1): painterly
   backdrops, character portraits, per-location vignettes — the biggest
   remaining "wow" upgrade; plan sketch in plans/agora-deliberative-game-plan.md.
4. From the script's open questions: interactive needs check ("say it back
   until the Count agrees he's been understood"), teacher cards, narrator
   interstitials, evidence cards, bias-events deck, expanding-agreement
   (~80% net support) as the success verdict, two-lesson arc.
5. Ops: agora functions/hosting not yet deployed anywhere (emulator only);
   `wizcol-agora` hosting site must be created before first deploy.

## Recent commit trail (this iteration, newest last)

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
