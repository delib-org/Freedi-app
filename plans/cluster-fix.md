# Cluster Map + MC — Triage Roadmap & Fix #1

## Context

The Thursday conference exposed a list of ~25 features and bugs across the **cluster map** (main app, `feat/cluster-map`) and the **mass-consensus (MC)** app. The user wants to fix them **one at a time, `/clear`-ing between each**, so no single context window gets large.

This plan does two things:
1. Defines a **tracked repo roadmap doc** (`docs/cluster-mc-roadmap.md`) that splits every item into a small, independently-shippable ticket, ordered by the Thursday deadline. It survives `/clear` and is the single source of truth we tick off across sessions.
2. Fully specs **Fix #1** (the highest-impact conference bug — *clusters disappearing from the map*) and starts it immediately after approval.

**Confirmed conference scope (everything else moves after Thursday):** cluster-map stability — clusters being lost, the Android "Oops" error, items showing as UNGROUPED — plus bigger/clearer cluster titles. Moderation tuning and the 7-word rule are post-conference.

### 📍 Status snapshot (2026-07-06)
Work lives on branch **`feat/cluster-map-roadmap`** (not `feat/cluster-map`; the sign
work is on `main-sign`, which does **not** yet have T0.3/T0.4/T1.x — merge forward when
ready).
- **Tier 0 — all done:** T0.1 (+T0.1b/c), T0.2, T0.3, T0.4 (mobile; desktop-centering not
  reproduced), T0.5. Cluster-map conference blockers are cleared.
- **Tier 1 — in progress:** T1.1 ✅, T1.2 ✅, T1.3 ✅ (moderation fail-open + BOTH admin-alert
  floods fixed: ModerationLog coalescing + Firestore-backed error-email throttle; committed
  `11671516f`, 41/41 jest). **Next open items:** T1.4 (emoji reactions), T1.5, T1.6.
- Also landed on this branch (separate plans): Events Phase 1 dashboard, Freedi Studio app.
- **Not yet deployed:**
  - **Functions** (T1.3): `moderation-log-service` + `error-notification-service` changes
    need `deploy:f:*` (me-west1) — e.g. `detectMultipleSuggestions`, `findSimilarStatements`,
    and any fn using the AI error-email path. Coalescing + cross-instance throttle only take
    effect once deployed.
  - **Hosting**: cluster fixes (T0.x) on next `deploy:h:prod`; admin ModerationLog "×N
    attempts" UI + MC copy (T1.1/T1.2) on next respective hosting deploy.

---

## Step 1 — Create the tracked roadmap doc

Create `docs/cluster-mc-roadmap.md` with the tickets below. Each ticket is self-contained (problem → files → approach → verify) so any one can be picked up cold after `/clear`. As we finish each, tick its checkbox and commit.

### 🔴 Tier 0 — Conference blockers (this week)

- [x] **T0.1 — Clusters disappear from the map** *(= Fix #1, specced below)*
- [x] **T0.2 — "Oops/unaccepted error" adding a cluster on Android**
  - Error message: "Oops! Sorry, an unexpected error has occurred. Cannot read properties of null (reading 'originX')
  - Root: `ClusterBoard.tsx:473 addCluster()` returns silently when `creator` is undefined (auth not ready on mobile); `createMindMapChild()` (`mapHelpers/mindMapStatements.ts:72`) and `createEmptyCluster()` (`condensationCuration.ts:347`) throw without user-facing feedback.
  - Approach: surface a toast/error on failure instead of silent return; guard against un-initialised `creator` (await auth / disable the add button until ready); verify required Statement fields are populated on mobile. Reproduce on Android via the MCP browser or a device.
- [x] **T0.3 — Items all show as UNGROUPED**
  - **Two causes, both now addressed.**
  - **(1) Cluster deletion** *(fixed by T0.1/T0.1b/T0.1c)* — a deleted cluster doc
    orphaned its members into the synthetic "Ungrouped" block.
  - **(2) Load-limit eviction** *(fixed here)* — `listenToMindMapData`
    (`optimizedListeners.ts`) loads only the newest **200** descendants
    (`orderBy createdAt desc, limit 200`). Cluster docs are created by synthesis;
    once a question takes on a burst of newer responses (a live conference), the
    older cluster docs fall out of the newest-200 window and vanish from the
    client, so their still-loaded members all render as "Ungrouped". This matches
    why it appeared at the conference but not in quiet testing.
    - **Fix:** a dedicated `listenToMindMapClusters` listener that loads *all*
      `isCluster` docs under the question (`parentId == q && isCluster == true`,
      few docs, no `orderBy` → no composite index needed) and merges them into the
      same Redux store. Composed into `listenToMindMapData`'s unsubscribe, so every
      map surface (cluster board, enhanced mind map, statement listeners) benefits.
    - **Verified:** tsc + ESLint clean; grouping invariant unit-tested
      (`mapCont.test.ts` — members stay flat when their cluster is absent).
    - **Live re-check still worthwhile:** open a question that had >200 responses
      and confirm clusters group correctly. **Takes effect on next hosting deploy.**
- [x] **T0.4 — Sticky-note edit steals the viewport on touch** *(mobile part done)*
  - **Mobile (fixed):** on the sticky-note board, editing a note or a cluster title
    opened a `<textarea autoFocus>`. On touch, `autoFocus` makes the browser scroll
    the field into view + open the keyboard, yanking the map viewport out from under
    the user — this was the "tapping a node recenters the map" symptom. Fix: new
    `focusEditField` ref helper (`map/mapHelpers/focusEditField.ts`) that focuses on
    fine-pointer (mouse/pen) devices with `{ preventScroll: true }` and does **nothing**
    on coarse-pointer (touch) devices, where the user taps the field to open the
    keyboard when ready. Wired into `ClusterCard.tsx` (note edit) and `ClusterBoard.tsx`
    (cluster-title edit); unit-tested (`focusEditField.test.ts`). `autoFocus` removed
    from both textareas. tsc + ESLint + jest all clean.
  - **Desktop centering (not reproduced):** the original note said the focused target
    "does not center horizontally." No tap-to-center behavior exists on the sticky
    board — the only auto-centering is in the *old* mind-elixir map (`selectNode`), and
    the board's `fit()` already centers on both axes. Left unchanged pending a concrete
    repro; if it resurfaces it's likely the mind-elixir map or a side-panel offset, not
    the cluster board.
  - Files touched: `map/mapHelpers/focusEditField.ts` (new), `ClusterCard.tsx`,
    `ClusterBoard.tsx`, `__tests__/focusEditField.test.ts` (new).
- [x] **T0.5 — Admin map-control panel + bigger/clearer cluster titles** (new feature)
  - **Done:** new `MapSettingsSchema` on `statementSettings.map` (shared-types) →
    `cardFontRem`, `clusterFontRem`, `synthVisibility`, `showProvenance`.
  - **(a)** Cluster pill/hub + card text now read `--map-cluster-font` /
    `--map-card-font` CSS vars set on the board root from settings, with raised
    defaults (cluster 1rem, card 0.9rem, was 0.82/0.74). Admin sliders in the new
    panel (clamped 0.6–2.2rem). `ClusterBoard.tsx` + `.module.scss`.
  - **(b)** `synthVisibility` gates layers in `boardClusters`: `all` (default),
    `clusters-only` (hide Ungrouped block), `originals-only` (flatten, no pills).
  - **(c)** "made from N responses" provenance line on each cluster pill
    (toggleable via `showProvenance`).
  - **Panel:** new `MapControlCard.tsx` rendered as a "Cluster map" subsection in
    `AISettings.tsx` (questions only), persisted via `setDoc({statementSettings:
    {map}}, {merge})`. i18n: 16 strings added to all 7 languages.
  - **Verified:** shared-types rebuilt, `tsc` clean, ESLint clean, `npm run build`
    succeeds. Takes effect on next `deploy:h:prod`.
  - **Goal:** give admins a panel to control how the cluster map renders, mirroring the existing "Join" / grouping admin-settings pattern. Settings persist on the statement so they apply for everyone viewing the map.
  - **(a) Font-size control + bigger titles** — admin sets the font size of the **sticky notes** (cards) and the **clusters** (pills/hub) independently. Today these are fixed in SCSS: card text `.cardText` `0.74rem`, cluster `.pill` `0.82rem`, hub `.hubText` `0.8rem` (`ClusterBoard.module.scss:69,101,269`). Drive them from CSS custom properties (e.g. `--map-card-font`, `--map-cluster-font`) set as inline style vars on the board root from settings, with the current rems as defaults. **Also raise the default title sizing/prominence** so clusters read clearly from a distance (the original "bigger/clearer cluster titles" ask) — bump the baseline via this same mechanism. SCSS via design tokens, no hardcoded values per CLAUDE.md.
  - **(b) Synth visibility toggle** — admin chooses what the map shows: **synth + originals together**, **clusters/synth only**, or **originals only (no synth)**. The data model already supports this: `CondensationConfig.viewLayers { raw, synth, cluster }` and `visibility.{main,massConsensus,join}` in `StatementSettings.ts` (`CondensationConfigSchema:135-153`). Reuse/extend these rather than inventing a new field. `ClusterBoard.tsx:178-189` filters `child.top.isCluster`; `mapCont.ts:115-120` resolves members from `integratedOptions[]` — gate which layer renders off the setting.
  - **(c) Synth provenance indication** — a synth/cluster statement should visibly indicate **which statements created it**. Source IDs are already on the synth doc: `integratedOptions[]` (member ids), plus `derivedFromStatementId` / `synthesisRunId` / `synthesisMechanism` (`StatementTypes.ts:170-200`). Surface this on the cluster card/pill (badge, count, or expandable "made from N responses" list linking to the originals). Originals carry the reverse pointer `integratedInto`.
  - **Panel UI** — follow the existing settings pattern: `StatementSettings.tsx` orchestrator + a new card alongside `GroupingSettings.tsx` / `JoinFormCard.tsx` (`src/view/pages/statement/components/settings/components/advancedSettings/`), persisted via `setDoc(ref, { statementSettings: { map: {...} } }, { merge: true })`. Reuse `SettingsModal.tsx`. New settings live under `statement.statementSettings` (extend `StatementSettings.ts` Valibot schema — fonts as `number()`; no `any`; i18n all labels via `useTranslation()` per CLAUDE.md). Types belong in `delib-npm`/`shared-types` for cross-app use.
  - **Files:** `StatementSettings.tsx`, new `MapSettings`/`MapControlCard` under `settings/components/advancedSettings/`, `packages/shared-types/src/models/statement/StatementSettings.ts` (schema), `ClusterBoard.tsx` + `ClusterBoard.module.scss` (consume font vars + visibility), `mapCont.ts` (layer filtering), `ClusterCard.tsx` (provenance badge).

### 🟡 Tier 1 — High-value, smallish (right after conference)

- [x] **T1.1 — Minimum-word requirement** on MC responses *(commit `fead512e9`)*
  - Shipped as an **admin-configurable** minimum instead of a hardcoded 7 —
    enforced only when set (`undefined`/`0` = off).
  - shared-types: `statementSettings.minResponseWords` (single source of truth) +
    per-question override in the MC survey config.
  - MC submit route: authoritative server-side enforcement → `400` + `MIN_WORDS`;
    new Unicode-safe `wordCount` util (`lib/utils/wordCount.ts`) + tests.
  - `SolutionPromptModal`: disables submit + shows "minimum N words" hint, threaded
    from `SwipeInterface` via question settings.
  - Admin inputs in `MapControlCard` (sticky-note map) and `UnifiedFlowEditor`
    (per-question); `cascadeMinResponseWords` mirrors the value onto each question
    Statement on survey save, only when explicitly set. i18n all 7 languages.
- [x] **T1.2 — Warm, good-faith rejection copy** *(commits `a03ac3c9e`, `1a715d1b4`)*
  - Replaced "Your submission contains inappropriate content" with a gentle,
    **category-based, client-localized** message in the participant's UI language
    (new `lib/utils/moderationMessage.ts` maps the server's stable `category` —
    personal_attack / profanity / hate_speech / sexual_content / violence_threats —
    to a `t()` string, falling back to "This didn't quite fit here").
  - Warmer toast titles + pre-submit loader copy (no more "scanning for profanity").
    Model's free-text `reason` kept server-side for the admin log. i18n all 7 langs.
- [x] **T1.3 — Moderation over-sensitivity + admin-alert flood** *(commits `a03ac3c9e` + this session)*
  - **Content sensitivity (done):** `checkForInappropriateContent` now **fails open** —
    any LLM error, JSON-parse failure, rate limit or model refusal previously returned
    `isInappropriate=true` and accused the author (a real risk under live load); it
    now allows + logs for async review. Removed "spam / gibberish / meaningless
    text" from the flag list so terse-but-legitimate answers aren't rejected.
    `containsBadLanguage()` aligned to fail open. (Moderation runs on OpenAI, not
    Gemini — the original "Gemini SAFETY filter" theory was wrong; it was
    fail-closed handling.)
  - **Admin-alert flood (done, this session) — two sources, both fixed:**
    - **(A) ModerationLog panel pile-up:** `logModerationRejection` wrote **one
      `moderationLogs` doc per attempt** (retries + over-firing → hundreds of
      near-identical rows). Now **coalesced**: the write targets a deterministic doc
      id `${userId}__${parentId}` in a transaction — first rejection creates the row
      (`attemptCount: 1`), each retry on the same question increments the count +
      updates `lastAttemptAt` and the latest text/reason/category, keeping the
      original `createdAt`. Result: **one row per (user, question)** with a
      "×N attempts" badge, not a flood.
      - shared-types: `ModerationLog` gains optional `attemptCount` + `lastAttemptAt`.
      - `functions/src/services/moderation-log-service.ts`: transactional coalescing
        write (5 unit tests).
      - `ModerationLog.tsx` + `.module.scss`: "×N attempts" badge + last-attempt time;
        i18n `attempts` / `Last attempt` in all 7 languages.
    - **(B) Admin ERROR EMAIL flood (the literal inbox alert):** any permanent AI
      failure during moderation (`checkForInappropriateContent` → `ai-service`
      `handleError`) emails `tal.yaron@gmail.com` via `notifyAIError`. The 1/hour
      throttle was an **in-memory Map** — per Cloud-Function instance, so an
      autoscaled burst under conference load sent one email per instance per hour.
      Now **Firestore-backed** (`reserveErrorNotificationSlot`, collection
      `adminErrorThrottle`): the hourly slot is reserved in a transaction so the limit
      holds **across instances**; suppressed same-type errors are counted and the next
      email that goes out carries a "N more … suppressed" digest line. Fails safe
      (stays silent) if the throttle store is unreachable. (4 unit tests.)
    - **Verified:** shared-types rebuilt; main-app `tsc` clean; functions `tsc` clean;
      ESLint clean on changed files; jest 41/41 green (9 new). Takes effect on next
      `deploy:f:*` (functions) + hosting deploy (admin UI).
- [x] **T1.4 — Emoji reactions** — admin-optional, cross-app evaluation mode.
  - Shipped as an **admin-configurable** `statementSettings.ratingMode`
    (`'agree-disagree'` default | `'reactions'`), **not** a hard replacement — the
    classic agree/disagree scale is untouched unless an admin switches a question
    to reactions. Per the user: reactions are a **positive-only 0→1** scale (no
    disagree) — 😐 0 · 🙂 0.25 · 😊 0.5 · 👍 0.75 · ❤️ 1.
  - **Single cross-app source of truth** in `@freedi/shared-types`:
    `RatingModeSchema` + `getEvaluationScale(mode)` / `getEvaluationRange` /
    `isValidEvaluationValue` / `getEvaluationEntry` (`models/statement/evaluationScale.ts`,
    14 unit tests). Every app builds its evaluation UI + validation from this, so
    a question set to reactions renders reactions **everywhere it's shown**.
  - **Honored in all 5 evaluation apps:** main app (`EnhancedEvaluation` faces →
    emoji), mass-consensus (swipe `SwipeCard`/`RatingButton` + classic
    `EvaluationButtons`), join (Mithril `Evaluation.ts`), flow (`RatingButtons.ts`),
    chat (`EvaluationBar.svelte`). Sign (binary ±1) and studio (no eval) are N/A.
  - **Admin toggles:** MC per-question (`UnifiedFlowEditor` → cascaded onto each
    question Statement via new `cascadeRatingMode`, sibling of
    `cascadeMinResponseWords`); main app (`EvaluationSettings` "Emoji reactions"
    toggle on the range/enhanced type). i18n: reaction labels + admin strings in
    all 7 languages.
  - **Consensus-safe:** reaction values (0..1) are a subset of the existing
    `[-1,1]` write range, so averages/pro-con counts keep working; no backend or
    consensus-math change. **Verified:** shared-types build + 180 jest; MC tsc +
    lint + 50 jest (swipe/cascade/scale); main-app tsc + lint; join tsc; flow
    tsc + build; chat svelte-check — all clean. Takes effect on next hosting
    deploys of each app.
- [ ] **T1.5 — Micro-copy refinement** pass across the interface (i18n files).
- [ ] **T1.6 — Font-size adjustment** for the whole map view (readability from a distance).

### 🟢 Tier 2 — Larger features (post-conference)

- [ ] **T2.1 — Zoom + detail levels** (zoom into individual posts; per-zoom cluster font size/color). Build on `usePanZoom.ts` (scale 0.2–2.5).
- [ ] **T2.2 — Expand/collapse clusters** + **sub-cluster visualization** (hierarchy). Extends `ClusterBoard.tsx` layout + `mapCont.ts` tree.
- [ ] **T2.3 — Synthesis / dedup of similar responses** (mark duplicates, suggest merges). Pipeline exists: `functions/src/synthesis/`, `similarity-grouping-service.ts:46`, `bulkCluster.ts` (DBSCAN).
- [ ] **T2.4 — Join/participate indicator** + **contact collection** (name/email/phone) + **Excel/Sheets export**. Current export is JSON-only (`apps/mass-consensus/app/api/surveys/[id]/export/route.ts`, `surveyExport.ts`); add CSV/XLSX + contact fields.
- [ ] **T2.5 — Pre-populate 6 initial responses** per question. Seeding scripts exist as a reference: `apps/mass-consensus/scripts/seed-ux-test.ts`.

---

## Step 2 — Fix #1 (T0.1): Stop synthesis from deleting manually-created clusters

### Problem (root cause confirmed)
Manually-created clusters carry `titleLockedByCreator: true` (`condensationCuration.ts:377`) so the AI won't *rename* them — but **nothing stops the synthesis pipeline from deleting them**. Two code paths nuke manual clusters:

1. **`dissolveQuestionSynthesis()`** — `functions/src/synthesis/derivedDocs.ts:97-145`. Treats every `isCluster` doc with members as a "proper cluster" and hard-deletes it (`reverseIntegration({deleteCluster:true})`). It does **not** check `titleLockedByCreator`. Runs before every re-cluster: `asyncJob/phases.ts:121`, `fn_synthesizeIdeas.ts:818`, `admin/fn_globalCluster.ts:218`, `admin/fn_reCluster.ts:78`.
2. **Live auto-dissolution** — `functions/src/synthesis/liveSynth/onOptionUpdateLive.ts:213-217`. When a member's edit is judged "different" and the cluster drops below 2 members, `dissolveCluster()` deletes the cluster doc (`:138`) — again without checking `titleLockedByCreator`.

When the cluster doc vanishes, its members orphan into "Ungrouped" (explains T0.3).

### Approach
Treat `titleLockedByCreator === true` as "manual cluster — pipeline must not delete." Single shared guard, applied at both deletion sites.

1. **`derivedDocs.ts` — `dissolveQuestionSynthesis()`**: exclude manual clusters from `properClusters` so they are neither reversed nor deleted. Define `isManualCluster(d) = d.isCluster === true && d.titleLockedByCreator === true` and filter them out of both the delete loop and the `properClusterIds` set (so they're not reclassified as malformed-derived and deleted at step 2 either). Leave their members and `integratedOptions[]` untouched. Add a `manualClustersPreserved` count to `DissolveResult` for the log line.
2. **`onOptionUpdateLive.ts` — `unlinkOptionFromCluster()`**: before calling `dissolveCluster()` at `:213`, skip auto-dissolution when `cluster.titleLockedByCreator === true` (keep the cluster even with <2 members; still record the unlink event). Manual clusters are admin intent, not auto-formed groups.
3. Sanity-check the other re-cluster entry points (`fn_synthesisBulkFlush.ts`, `synthesis/pipeline/clusterOps.ts`, `bulkCluster.ts`) only spawn/merge — they rely on `dissolveQuestionSynthesis` for teardown, so guarding it covers them. Confirm during implementation; no change expected.

Keep the guard in one tiny helper so the rule lives in a single place.

### Files
- `functions/src/synthesis/derivedDocs.ts` (primary)
- `functions/src/synthesis/liveSynth/onOptionUpdateLive.ts` (primary)
- Verify-only: `fn_synthesisBulkFlush.ts`, `synthesis/pipeline/clusterOps.ts`

### Verification
1. `cd functions && npm run build` — type-checks (no `any`, structured `logError`/`logger` per CLAUDE.md).
2. Add/extend a unit test for `dissolveQuestionSynthesis`: given a `titleLockedByCreator` cluster + a synth cluster, assert only the synth cluster is deleted and the manual one (and its members) survive. (`cd functions && npm test -- -t 'dissolveQuestionSynthesis'`.)
3. Manual end-to-end (test project): create a manual cluster on the map with 2 notes → trigger an admin re-cluster / synthesis run → confirm the manual cluster is still present. Then edit one note so the cluster would drop below 2 → confirm it persists.
4. Deploy affected functions to test only when ready: `npm run deploy:f:test -- <functionNames>` (me-west1; use deploy scripts, never raw firebase deploy).

### Commit
Commit T0.1 once built + verified (finished, verified changes commit immediately per user feedback). Branch `feat/cluster-map`. Tick T0.1 in the roadmap doc in the same commit.

---

## After Fix #1
`/clear`, then start **T0.2 (Android error)** fresh — the roadmap doc carries all context forward.

---

## 🗓️ Fix batch #2 — 2026-07-06 (ALL due today)

New issues from live testing. Same workflow: fix one ticket at a time, `/clear` between each, tick + commit. Suggested order (independent first, cheapest UX wins, then deeper backend): **F2.1 → F2.2 → F2.5 → F2.4 → F2.9 → F2.8 → F2.6 → F2.3 → F2.7**.

### ⚠️ Branch reality check (read first — blocks F2.3 & F2.7)
The working tree is currently on **`feat/agora-app`**. All the cluster-map T0/T1 work — **and specifically the cluster-map response FILTER (F2.7) and the `ratingMode`/0→1 reactions feature (F2.3)** — live only on **`feat/cluster-map-roadmap`** (commits `65facac`, `0a1f175`). In this checkout `filterMetric`/`passesFilter`/`MapFilterMetric`/`setMapFilter` and `ratingMode`/`getEvaluationScale`/`RatingModeSchema` **do not exist**. The base cluster map (`ClusterBoard.tsx`, `ClusterCard.tsx`) and MC do exist here.
- **Before executing this batch, decide the target branch.** Do the work on `feat/cluster-map-roadmap` (has everything), or merge `feat/cluster-map-roadmap` forward first. F2.1/F2.5/F2.9/F2.8 touch code present on both; F2.3/F2.7 require the roadmap branch.

### ❓ Two product decisions to confirm before coding
- **F2.3:** Is "like" = the existing **reactions mode** (positive-only 0→1: 😐🙂😊👍❤️), or a **new simple binary like** (0↔1, thumb) independent of `ratingMode`? Spec below assumes the reactions mode.
- **F2.6:** Should the completion link point at MC's **existing all-solutions results** (`/q/{id}/results?tab=all`, exists today) or the **main-app cluster map** (cross-app URL — "the map")? User said "the map"; confirm which surface.

---

- [ ] **F2.1 — RTL sticky-note menu overlaps the card text**
  - **Problem:** `.cardMenu` is `position:absolute; inset-inline-end:2px` and `.card` carries `dir="auto"`, so for Hebrew/Arabic notes the card flips to RTL and the "⋮" button docks to the same corner where RTL text starts. `.cardText` (`text-align:start`) reserves **no** inline space for the absolutely-positioned 22px button, so it covers the first word. LTR is unaffected (menu top-right, text top-left).
  - **Files:** `src/view/pages/statement/components/map/ClusterMap/ClusterCard.tsx` (menu JSX ~120-179, text ~200-202); `.../ClusterBoard.module.scss` (`.card` 252-273, `.cardText` 281-293, `.cardMenu` 301-307, `.cardMenuButton` 309-323, `.cardMenuList` 325-350).
  - **Approach:** reserve inline space so text never sits under the menu — add `padding-inline-end` (~26px) to `.cardText` (matching the menu's corner), or a first-line indent / float spacer. Keep the menu on the inline-end corner (RTL-correct) but ensure text wraps clear of it. Design tokens / logical props only (no hardcoded `left/right`).
  - **Verify:** long Hebrew + long English note, admin (menu visible) and non-admin — no overlap in either direction; footer eval row still fits.

- [ ] **F2.2 — MC moderation loader copy is too clinical/accusatory**
  - **Problem:** `EnhancedLoader` stage `content-check` shows **"Checking for inappropriate content…"** / "Ensuring safe community standards" / tip "AI scans for profanity and harmful content". T1.2 warmed the *rejection* + some loader copy but this stage still reads like a background check. Make it polite/neutral.
  - **Files:** `apps/mass-consensus/src/components/question/EnhancedLoader.tsx` (stage config lines 26-31; `messageKey`/`subMessageKey`/`tipKey`); stage constants in `apps/mass-consensus/src/constants/common.ts` (`LOADER_STAGES.CONTENT_CHECK`). Uses i18n `t()` with English-string keys (via `@freedi/shared-i18n/next`). Shown from `ProposalModal.tsx:142`, `AddSolutionFlow.tsx:348,373`.
  - **Approach:** rewrite the three strings to warm framing (e.g. "Reviewing your response…", "Getting it ready to share", drop the profanity tip). If key strings change, update the component + constants and add the new keys/values to **all 7** language files (en/he/ar/es/de/nl/fa); if reusing keys, just update translations.
  - **Verify:** submit in MC, watch the loader first stage; confirm new copy renders and every language has it.

- [ ] **F2.3 — "Likes" on sticky notes / MC cards don't behave as a 0→1 like** *(needs `feat/cluster-map-roadmap`)*
  - **Problem:** `ClusterCard.tsx` still uses the classic **5-face −1..+1 agree/disagree** (`enhancedEvaluationsThumbs`, `getEvaluationThumbIdByScore`) and shows consensus/average — **never migrated to `ratingMode`**, even on the roadmap branch. MC cards (`EvaluationButtons.tsx`, `RatingButton.tsx`, swipe cards) also use −1..+1. So no positive-only 0→1 "like".
  - **How to enable the mode (answer to "show me how to set"):** per-question toggle — main app **Settings → Evaluation → "Emoji reactions"** (`EvaluationSettings.tsx`, range/enhanced type) sets `statementSettings.ratingMode = 'reactions'`; MC **UnifiedFlowEditor → "How participants rate options" → Emoji reactions** (cascaded via `cascadeRatingMode`). **Both exist only on `feat/cluster-map-roadmap`, and neither wires the cluster-map sticky note**, so toggling alone won't fix it without the code change below.
  - **Files:** `ClusterCard.tsx` (lines 8, 85, 95-99, 205-248), `ClusterBoard.tsx` (thread `ratingMode` to the card), `packages/shared-types/src/models/statement/evaluationScale.ts` (`getEvaluationScale`, `REACTIONS_SCALE` 😐0·🙂0.25·😊0.5·👍0.75·❤️1), `src/controllers/db/evaluation/setEvaluation.ts` (already accepts 0..1 since it's ⊂ −1..1). MC verify: `EvaluationButtons.tsx`, `RatingButton.tsx`, `SwipeCard.tsx`.
  - **Approach:** make `ClusterCard`/`ClusterBoard` read `statement.statementSettings?.ratingMode` and build the face/emoji row from `getEvaluationScale(ratingMode)` instead of the hardcoded thumbs; emit the scale's value (0..1 for reactions). Confirm MC evaluation components honor `ratingMode` (T1.4 claims all 5 apps — re-verify the cluster map + MC cards specifically). Show the like as filled(1)/empty(0).
  - **Verify:** set a question to reactions → open cluster map + MC → like a card → value 0→1, persists, shows everywhere.

- [ ] **F2.4 — Clusters & synth must run automatically for MC questions**
  - **Finding (mostly already works — verify + guard):** MC live-synth defaults **ON**. `functions/src/synthesis/liveSynth/featureGate.ts` defaults MC questions ON when `statementSettings.liveSynthEnabled` is unset (non-MC OFF); `apps/mass-consensus/src/lib/firebase/synthesis/cascadeSynthesisToggle.ts` defaults ON at survey (`surveyOn = surveyOverride ?? true`) and per-question (`?? true`), written on survey save via `surveyCrud.ts` (`createSurvey`/`updateSurvey`). Only an explicit admin disable turns it off.
  - **Approach:** verify a freshly created MC question actually clusters with **no** manual toggling. If it doesn't: check (a) the question is typed `questionSettings.questionType === massConsensus` so `isMassConsensus()` detects it, (b) no stale survey default wrote `liveSynthEnabled:false`, (c) enough members to trigger clustering, (d) it isn't the F2.5 pipeline bug eating clusters. Likely no code change — but if the default isn't reliably applied, make it explicit at MC question creation.
  - **Verify:** create MC survey + question → add responses → clusters form automatically; toggling survey OFF still kills it.

- [ ] **F2.5 — "Add cluster" disappears ~1s later (empty manual cluster eaten by the on-create live-synth pipeline)**
  - **Root cause (confirmed):** `createEmptyCluster` (`src/controllers/db/statements/condensationCuration.ts:347-398`) writes a `StatementType.option` doc with `isCluster:true, titleLockedByCreator:true, integratedOptions:[]`. The two `dissolve*` cleanup paths ARE guarded for manual clusters (`derivedDocs.ts` `isManualCluster` 41-45; `onOptionUpdateLive.ts` guard 217-224). **But the on-CREATE pipeline is not:** `functions/src/synthesis/liveSynth/onOptionCreateLive.ts:58` only returns when `integratedOptions.length > 0` (empty cluster passes), then `runSinglePipeline.ts` (145-188) has **no `isCluster`/`titleLockedByCreator` early-skip** — so the empty cluster is embedded and attached/merged into a similar cluster (or hidden via `integratedInto`), vanishing ~1s later (async CF round-trip). Fires only when live-synth is on — i.e. exactly MC/cluster maps.
  - **Files:** `functions/src/synthesis/liveSynth/onOptionCreateLive.ts` (~line 58), `functions/src/synthesis/pipeline/runSinglePipeline.ts` (~lines 150-155). Reuse the existing `isManualCluster`/an `isClusterDoc` helper.
  - **Approach:** add an early-skip: if `option.isCluster === true` (and/or `titleLockedByCreator === true`), the create pipeline treats it as a **container, never a member option** and returns before embedding/attach. Guard at `onOptionCreateLive.ts:58` and defensively in `runSinglePipeline`.
  - **Verify:** functions `tsc` + unit test (isCluster option → pipeline skips it). E2E on a live-synth question: add cluster → still present after >5s. Deploy affected fns to **test** (`npm run deploy:f:test -- <fns>`, me-west1).

- [ ] **F2.6 — MC setting: after completion, show a link to "all the solutions" (the map)**
  - **Finding:** MC has **no dedicated cluster-MAP view** — the map is a main-app feature. MC "all solutions" surfaces today: `/q/{statementId}/results?tab=all` and `/q-results/{statementId}`. Completion screen = `apps/mass-consensus/src/components/survey/SurveyComplete.tsx` (rendered by `app/s/[surveyId]/complete/page.tsx`); it already gates buttons on `survey.showEmailSignup` (lines 266, 298-313) — the exact pattern to copy.
  - **Files:** schema `packages/shared-types/src/models/survey/surveyModel.ts` (`SurveySchema` 231-277 — add optional top-level field like `showEmailSignup` at 270); request DTOs `apps/mass-consensus/src/types/survey.ts` (`CreateSurveyRequest` 64-90, `UpdateSurveyRequest` 95-130); admin toggle `apps/mass-consensus/src/components/admin/SurveyForm.tsx`; completion UI `SurveyComplete.tsx`.
  - **Approach:** add `showAllSolutionsLink?: boolean` (+ optional `allSolutionsLinkLabel?`) to `SurveySchema`, thread through the DTOs + `SurveyForm`, then render a gated link (per question in `survey.questionIds`) on `SurveyComplete`. **DECISION (see top):** point at MC `/q/{id}/results?tab=all` (exists) or the main-app cluster map (cross-app URL). i18n label all 7 langs.
  - **Verify:** enable setting → complete survey → link appears → clicking lands on the chosen surface.

- [ ] **F2.7 — Cluster-map filter: viewer filter local-to-self; admin filters everyone (+ admin "only me" switch)** *(needs `feat/cluster-map-roadmap`)*
  - **Problem (current on branch):** every writer — admin **or** permitted viewer — mutates the **shared** `statementSettings.map`, so a viewer's filter changes the map for everyone.
  - **Files (branch `65facac`):** read/apply `ClusterBoard.tsx` (`mapSettings` ~191, `filterMetric`/`minConsensus`/`minAverageEvaluation` 199-201, `passesFilter` ~229, applied in `boardClusters` 277/295/308); write `MapAdminPanel.tsx` (`update` 134-148 = shared write, `updateFilter` 153-181, `allowViewerFilter` toggle 460-471); gating `ClusterMap.tsx` (53-54); callable `functions/src/fn_setMapFilter.ts` (`applyMapFilter` — writes shared map, requires `allowViewerFilter`).
  - **Approach:** (1) add a **per-user local** filter state (component state + `localStorage` keyed by `statementId+uid`). (2) `passesFilter` prefers the local filter when set, else falls back to the shared admin filter. (3) **Non-admin viewer writes local only** — stop calling `setMapFilter`/writing shared map. (4) **Admin switch**: "Apply to everyone" → current shared `update`; "Only me" → local state. (5) `allowViewerFilter` still gates whether viewers may filter at all; `setMapFilter` becomes admin-only or is deprecated for viewers.
  - **Verify:** viewer filter changes only their view; admin "everyone" changes all; admin "only me" stays local.

- [ ] **F2.8 — Simple "add admins" interface for the question's main admin**
  - **Finding:** promote-to-admin UI **already exists** — `MembershipCard.tsx` (`handleSetRole` 58-71) and `EnhancedMemberCard.tsx` (`onRoleChange(userId, Role.admin)` 131-132) both call `updateMemberRole` (`src/controllers/db/subscriptions/setSubscriptions.ts:200`). Gap: it only promotes **existing subscribers**; no "add admin by email" for a non-member. Also flag a possibly-inverted guard in `setRoleToDB` (`setSubscriptions.ts:185`).
  - **Files:** controller `setSubscriptions.ts` (`updateMemberRole` 200, `setStatementSubscriptionToDB` 32/83 auto-admins creator); UI `.../settings/components/membership/` (`MembersManagement.tsx`, `EnhancedMembersManagement.tsx`, `MembershipCard.tsx`); `InviteModal.tsx`.
  - **Approach:** surface a focused "Admins" section for the creator/main admin. Reuse `MembersManagement` + `updateMemberRole` to promote existing members. For non-members: invite-then-promote via `InviteModal` (creates `member`) + promote, or a small "Add admin by email" that creates a subscription with `Role.admin` (mirror `setStatementSubscriptionToDB`, guarded to creator/admin). Fix the `setRoleToDB` guard if inverted.
  - **Verify:** as creator, add another user as admin → role written → that user gains admin powers; guard prevents non-admins.

- [ ] **F2.9 — Cluster-map "Summarize top solutions" button (reuse existing mechanism)**
  - **Finding:** existing summary flow — `SummarizeButton` (admin-only) + `SummarizeModal` + `SummaryDisplay` (visible to **all**) under `src/view/pages/statement/components/statementTypes/question/document/MultiStageQuestion/components/`; hook `useSummarization.ts` (`generateSummary`) → `summarizationController.ts` (`requestDiscussionSummary`) → callable **`summarizeDiscussion`** (`functions/src/fn_summarizeDiscussion.ts`) → writes `summary` + `summaryGeneratedAt` on the **question doc** (shared → all can read). It selects "top solutions" via `where('isChosen','==',true)` sorted by `consensus` desc.
  - **Files:** reuse the above; wire into `ClusterMap.tsx`/`ClusterBoard.tsx` (toolbar button + summary panel).
  - **Approach:** add an admin/creator-gated "Summarize" button in the cluster map (same `useEditPermission`) that calls `requestDiscussionSummary(subject.statementId, prompt)`; render `SummaryDisplay` reading `subject.summary` for everyone. **Caveat:** `summarizeDiscussion` errors if **no** options are `isChosen` — confirm the cluster-map question has chosen/top options, else extend the CF to fall back to top-by-consensus or ensure the cutoff ran.
  - **Verify:** as admin in the cluster map, press Summarize → summary generates and appears for all viewers.

### Deploy targets for batch #2
- **Hosting** (main app): F2.1, F2.3, F2.7, F2.8, F2.9 UI → `deploy:h:prod` (or `:test` first).
- **MC hosting**: F2.2, F2.4, F2.6 → MC deploy.
- **Functions** (me-west1, `deploy:f:*`): F2.5 (`onOptionCreateLive`/`runSinglePipeline`), possibly F2.9 (`summarizeDiscussion` if the isChosen fallback is added), F2.7 (`fn_setMapFilter` if repurposed). Watch the stale-functions abort (delete removed fns first) and never `--force` prod indexes.

