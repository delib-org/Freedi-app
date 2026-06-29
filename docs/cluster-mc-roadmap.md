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

- [ ] **T0.2 — "Oops/unaccepted error" adding a cluster on Android**
  - `ClusterBoard.tsx:473 addCluster()` returns silently when `creator` is undefined
    (auth not ready on mobile); `createMindMapChild()`
    (`map/mapHelpers/mindMapStatements.ts:72`) and `createEmptyCluster()`
    (`condensationCuration.ts:347`) throw without user-facing feedback.
  - Surface a toast on failure; guard against un-initialised `creator` (disable the
    add button until auth ready). Reproduce on Android.

- [ ] **T0.3 — Items all show as UNGROUPED**
  - Likely a *symptom* of T0.1 (deleted cluster → members orphan into the synthetic
    "Ungrouped" block: `map/mapCont.ts:91-159`, `ClusterBoard.tsx:176-184`). Re-test
    after T0.1; if it persists, chase the `useMindMap`/Redux listener race
    (`MindMapMV.tsx:13-74`).

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

- [ ] **T0.4 — Bigger / clearer cluster titles**
  - Pills `0.82rem`, hub `0.8rem` (`ClusterBoard.module.scss:109,71`). Increase
    title sizing/prominence; optional font-size control. SCSS + design tokens only.

## 🟡 Tier 1 — High-value, smallish (right after conference)

- [ ] **T1.1 — Min 7-word requirement** on MC responses
  (`apps/mass-consensus/src/constants/common.ts:34`,
  `app/api/statements/[id]/submit/route.ts:110`, `proposalController.ts:31`). i18n.
- [ ] **T1.2 — Reword "inappropriate content"** to explain what the system is doing
  (`functions/src/services/moderation-log-service.ts`, `ai-service.ts:186`). i18n.
- [ ] **T1.3 — Moderation over-sensitivity** (Hebrew/cultural terms e.g. "Bedouins")
  + **too many admin alerts**. Tune Gemini prompt (`ai-service.ts:186-280`,
  `fn_profanityChecker.ts`); throttle/aggregate admin notifications.
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
