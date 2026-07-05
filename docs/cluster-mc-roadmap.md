# Cluster Map + MC — Conference Roadmap

Tracking the cluster-map and mass-consensus (MC) fixes surfaced by the conference
test. We work one ticket at a time, verify, commit, then move to the next. Tick
each box and reference the commit when done.

> **Working branch:** `fix/cluster-map-stability`

---

## 🔴 Tier 0 — Conference blockers

- [x] **T0.1 — Clusters disappear from the map**
  - **Root cause:** manual clusters carry `titleLockedByCreator: true` (stops AI
    *rename*) but nothing stopped *deletion*. The synthesis pipeline nuked them:
    (1) `dissolveQuestionSynthesis()` hard-deletes every `isCluster` doc before each
    re-cluster, and (2) live auto-dissolution deletes a cluster when an edit drops it
    below 2 members. Deleted doc → members orphan into "Ungrouped" (drives T0.3).
  - **Fix:** shared `isManualCluster()` guard (`isCluster && titleLockedByCreator`)
    applied at both deletion sites so the pipeline preserves creator clusters.
  - **Files:** `functions/src/synthesis/derivedDocs.ts`,
    `functions/src/synthesis/liveSynth/onOptionUpdateLive.ts`,
    test `functions/src/synthesis/__tests__/derivedDocs.test.ts`.
  - **Verified:** `npm run build` clean; `npm test -- derivedDocs` green.
    Still TODO before relying on it in prod: end-to-end on a test project + deploy
    affected functions via `npm run deploy:f:test`.

- [x] **T0.1b — Adding a note to a cluster drops it into "Ungrouped"**
  - **Root cause:** same family as T0.1. Adding a note creates a "New Option"
    placeholder, assigns it to the cluster, then the user types the real text. That
    edit fires `liveSynthOnOptionUpdate`, which judged the text "different" from
    "New Option" and **unlinked the note from the cluster** — back to Ungrouped.
    Live-synth defaults ON for Mass-Consensus questions (`SYNTHESIS_LIVE_SYNTH_ENABLED=true`).
  - **Fix:** in the edit-invalidation unlink loop, skip clusters with
    `titleLockedByCreator` — admin-curated membership is never auto-unlinked.
  - **Files:** `functions/src/synthesis/liveSynth/onOptionUpdateLive.ts`,
    test `.../liveSynth/__tests__/onOptionUpdateLive.test.ts`.
  - **Verified:** `npm run build` clean; `onOptionUpdateLive` tests 17/17.
    **Needs redeploy of `liveSynthOnOptionUpdate` to prod** to take effect.

- [x] **T0.2 — "Oops/unaccepted error" adding a cluster on Android**
  - **Root cause:** the error string — *"Cannot read properties of null (reading
    'originX')"* — comes from the touch-pan handler, not the add path. In
    `map/hooks/usePanZoom.ts:288` the `setTransform` updater closed over the mutable
    `let touchPan` via a `touchPan!` non-null assertion. React can invoke a functional
    updater during a later render, by which point `onTouchEnd` may have nulled
    `touchPan` → null deref crash on mobile during the touch sequence around an add.
  - **Fix:** snapshot `touchPan` origin/start into block-scoped consts before
    `setTransform`, so the updater never touches the mutable ref (`usePanZoom.ts`).
  - **Secondary:** `addCluster()` returned silently while `creator` was undefined
    (auth not ready on mobile). The add-cluster button is now `disabled` until
    `creator` is ready, with a "Signing you in…" tooltip (i18n added to all 7
    languages) — no more silent no-op (`ClusterBoard.tsx`).

- [x] **T0.3 — Items all show as UNGROUPED**
  - **Cause 1 — cluster deletion** (fixed by T0.1/b/c): a deleted cluster doc
    orphaned its members into "Ungrouped".
  - **Cause 2 — load-limit eviction** (fixed here): `listenToMindMapData` loads
    only the newest 200 descendants (`createdAt desc, limit 200`). Synthesis-made
    cluster docs get pushed out of that window once a question gathers a burst of
    newer responses, so their members all orphan into "Ungrouped" — matches why it
    hit at the conference (high volume) but not in testing.
  - **Fix:** dedicated `listenToMindMapClusters` always loads the (few) `isCluster`
    docs under the question (`parentId == q && isCluster == true`; no orderBy → no
    composite index) and merges them into Redux, composed into
    `listenToMindMapData`'s unsubscribe. Grouping invariant unit-tested.
    **Live re-check on a >200-response question recommended. Hosting deploy needed.**

- [x] **T0.4 — Editing a sticky note steals the viewport on touch**
  - **Root cause:** the note-edit and cluster-title `<textarea>` used the bare
    `autoFocus` attribute. On touch, the browser scrolls the focused field into view
    and opens the keyboard, yanking the map viewport — read as "tapping a node
    recenters the map."
  - **Fix:** `focusEditField` ref helper (`map/mapHelpers/focusEditField.ts`) —
    focuses with `{ preventScroll: true }` only on fine-pointer devices, no-op on
    touch (user taps to open the keyboard). Wired into `ClusterCard.tsx` +
    `ClusterBoard.tsx`; `autoFocus` removed. Unit-tested.
  - The old "desktop doesn't center horizontally" note could not be reproduced on
    the cluster board (no tap-to-center there; `fit()` already centers both axes) —
    left for a concrete repro. **Takes effect on next hosting deploy.**

- [x] **T0.1c — Cluster shows a different color on each client/render**
  - **Root cause:** clusters with no saved `color` fell back to
    `CLUSTER_PALETTE[index % len]`, keyed on the cluster's *position* in the
    children array. That position differs per client (load/sort order) and shifts
    as notes are added/removed — so the same cluster rendered pink on one device,
    green on another.
  - **Fix:** derive the fallback palette slot from a stable hash of the cluster's
    `statementId` (`paletteIndexForId`), so the color is identical on every client
    and survives reorders. Frontend only — `ClusterBoard.tsx`. No data migration.
  - **Verified:** tsc clean, ESLint clean. **Takes effect on next hosting deploy**
    (`npm run build` + `deploy:h:prod`), not a functions deploy.

- [x] **T0.5 — Admin map-control panel + bigger/clearer cluster titles** (was T0.4)
  - New `statementSettings.map` schema (shared-types): `cardFontRem`,
    `clusterFontRem`, `synthVisibility`, `showProvenance`.
  - **(a)** Cluster pill/hub + card text driven by `--map-cluster-font` /
    `--map-card-font` CSS vars from settings; raised defaults (cluster 1rem, card
    0.9rem). Admin sliders (0.6–2.2rem). `ClusterBoard.tsx` + `.module.scss`.
  - **(b)** `synthVisibility` layer gate: all / clusters-only / originals-only.
  - **(c)** "made from N responses" provenance on each cluster (toggleable).
  - **Panel:** `MapControlCard.tsx` → "Cluster map" subsection in `AISettings.tsx`
    (questions only). i18n in all 7 languages.
  - **Verified:** shared-types rebuilt, tsc + ESLint clean, `npm run build` ok.
    Takes effect on next `deploy:h:prod`.

## 🟡 Tier 1 — High-value, smallish (right after conference)

- [x] **T1.1 — Configurable minimum-word requirement** on responses
  - **Change of scope:** instead of a hardcoded 7-word rule, the minimum is now
    admin-configurable and **only enforced when set** (`undefined`/`0` = off).
  - **Source of truth:** `statementSettings.minResponseWords` on the question
    Statement (shared-types). Read by the submit route, the client modal and the
    map panel.
  - **Enforcement (authoritative):** MC submit route rejects below-minimum
    responses with `400` + `MIN_WORDS` code (`app/api/statements/[id]/submit/route.ts`).
    Word counting via `src/lib/utils/wordCount.ts` (unit-tested, Unicode-safe).
  - **Client hint:** `SolutionPromptModal.tsx` disables submit + shows
    "minimum N words", threaded from `SwipeInterface` via the question settings.
  - **Admin — sticky-note map:** number input in `MapControlCard.tsx` writes
    `statementSettings.minResponseWords` directly.
  - **Admin — MC:** per-question number input in `UnifiedFlowEditor.tsx` stores a
    `minResponseWords` override in the survey config; `cascadeMinResponseWords.ts`
    mirrors it onto each question Statement on survey save (only when explicitly
    set, so it never clobbers a value set from the map panel).
  - **i18n:** new strings added to all 7 languages (en, he, ar, es, de, nl, fa).
  - **Verified:** shared-types rebuilt; `npm run typecheck` clean (main + MC);
    MC lint clean; unit tests green (wordCount, cascade, proposalController,
    surveyCrud, shared-types). **Takes effect on next `deploy:h:prod` (hosting)
    + MC deploy; no functions deploy needed.**
- [x] **T1.2 — Warm, good-faith rejection copy** (the "rejection moment")
  - Replaced *"Your submission contains inappropriate content. Please revise."*
    with *"This didn't quite fit here. Please rephrase and try again."* and the
    model now returns its `reason` as a short, kind, good-faith message in the
    author's language (never name-calling).
  - Warmed the toast titles (*Invalid Content* → *Let's try that again*;
    *Check Failed* → *We couldn't check that just now*) and the pre-submit loader
    (*Checking for inappropriate content* → *Reviewing your idea* / *A quick check
    helps keep the space welcoming for everyone*).
  - **Files:** `ai-service.ts`, `fn_findSimilarStatements.ts`,
    `fn_detectMultipleSuggestions.ts`, MC `constants/common.ts`,
    `AddSolutionFlow.tsx`, `EnhancedLoader.tsx`; i18n in all 7 languages.
- [x] **T1.3 — Moderation over-sensitivity + admin-alert flood** (done)
  - **Root cause corrected:** moderation now runs on OpenAI (gpt-4o-mini), not
    Gemini — so Google's SAFETY filter is no longer the culprit. The wrongful
    accusations came from **fail-closed** error handling: any LLM error / JSON
    parse failure / model refusal returned `isInappropriate: true` and accused a
    well-meaning participant. Under conference load (rate limits, hiccups) this
    spiked.
  - **Fix (done):** `checkForInappropriateContent` now **fails open** — on any
    error it allows the content and logs it for async review instead of blocking
    the author. Removed *"spam / gibberish / meaningless text"* from the flag list
    so terse/unusual-but-legitimate answers aren't rejected. Aligned the unused
    `containsBadLanguage` to fail open too. (`ai-service.ts`, `fn_profanityChecker.ts`)
  - **Admin-alert flood (done) — two sources:**
    - **ModerationLog panel pile-up:** `logModerationRejection` wrote one
      `moderationLogs` doc per attempt. Now coalesced into one row per
      (user, question) keyed `${userId}__${parentId}`, with `attemptCount` +
      `lastAttemptAt` and a "×N attempts" badge in the admin panel.
      (`moderation-log-service.ts`, `ModerationLog.tsx`, shared-types `ModerationLog`.)
    - **Admin error EMAIL flood:** `notifyAIError` emailed the admin on every
      permanent AI failure, throttled only by an in-memory (per-instance) Map — weak
      under autoscaling. Now Firestore-backed (`reserveErrorNotificationSlot`,
      `adminErrorThrottle`): 1/hour/error-type **across instances**, with a
      suppressed-count digest line on the next sent email. Fails safe if the store is
      unreachable. (`error-notification-service.ts`.)
    - Unit-tested (9 tests across `__tests__/moderation-log-service.test.ts` +
      `__tests__/error-notification-throttle.test.ts`).
- [ ] **T1.4 — Emoji reactions** (heart/smiley/like) replacing like/dislike. Config
  already exists: `RATING_CONFIG`/`ZONE_CONFIG` (`apps/mass-consensus/src/constants/common.ts:147-195`),
  `RatingIcon.tsx`, `SwipeCard.tsx`, `RatingButtons.tsx`.
- [ ] **T1.5 — Micro-copy refinement** pass (i18n files).
- [ ] **T1.6 — Map font-size adjustment** (readability from a distance).

## 🟢 Tier 2 — Larger features (post-conference)

- [ ] **T2.1 — Zoom + detail levels** (zoom into individual posts; per-zoom cluster
  font size/color). Build on `map/hooks/usePanZoom.ts`.
- [ ] **T2.2 — Expand/collapse clusters** + **sub-cluster visualization**
  (`ClusterBoard.tsx` layout + `mapCont.ts` tree).
- [ ] **T2.3 — Synthesis / dedup of similar responses** (mark duplicates, suggest
  merges). `functions/src/synthesis/`, `similarity-grouping-service.ts:46`,
  `bulkCluster.ts` (DBSCAN).
- [ ] **T2.4 — Join/participate indicator** + **contact collection**
  (name/email/phone) + **Excel/Sheets export**. Current export is JSON-only
  (`apps/mass-consensus/app/api/surveys/[id]/export/route.ts`, `surveyExport.ts`).
- [ ] **T2.5 — Pre-populate 6 initial responses** per question. Reference seeding:
  `apps/mass-consensus/scripts/seed-ux-test.ts`.
