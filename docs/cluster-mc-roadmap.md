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

- [ ] **T0.3 — Items all show as UNGROUPED**
  - Likely a *symptom* of T0.1 (deleted cluster → members orphan into the synthetic
    "Ungrouped" block: `map/mapCont.ts:91-159`, `ClusterBoard.tsx:176-184`). Re-test
    after T0.1; if it persists, chase the `useMindMap`/Redux listener race
    (`MindMapMV.tsx:13-74`).

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
