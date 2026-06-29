# Cluster Map + MC — Triage Roadmap & Fix #1

## Context

The Thursday conference exposed a list of ~25 features and bugs across the **cluster map** (main app, `feat/cluster-map`) and the **mass-consensus (MC)** app. The user wants to fix them **one at a time, `/clear`-ing between each**, so no single context window gets large.

This plan does two things:
1. Defines a **tracked repo roadmap doc** (`docs/cluster-mc-roadmap.md`) that splits every item into a small, independently-shippable ticket, ordered by the Thursday deadline. It survives `/clear` and is the single source of truth we tick off across sessions.
2. Fully specs **Fix #1** (the highest-impact conference bug — *clusters disappearing from the map*) and starts it immediately after approval.

**Confirmed conference scope (everything else moves after Thursday):** cluster-map stability — clusters being lost, the Android "Oops" error, items showing as UNGROUPED — plus bigger/clearer cluster titles. Moderation tuning and the 7-word rule are post-conference.

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
  - Likely a *symptom* of T0.1 (when a cluster doc is deleted, its members orphan into the synthetic "Ungrouped" block — `mapCont.ts:91-159`, `ClusterBoard.tsx:176-184`). Verify it is resolved by T0.1 first; if it persists, investigate the `useMindMap`/Redux listener race (`MindMapMV.tsx:13-74`).
- [ ] **T0.4 — Target tap/center behavior on the map**
  - On **mobile**: pressing on a target should **not** focus/recenter the map (tapping a node currently steals/refocuses the viewport — disable the auto-focus-on-press on touch).
  - On **desktop**: the target does **not** center horizontally (centering is off-axis — fix so the focused target centers horizontally as well as vertically).
  - Files: `usePanZoom.ts` (focus/center logic) + `ClusterBoard.tsx` (tap/press handlers). Look at where a node press triggers a recenter and make it pointer-type aware.
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

- [ ] **T1.1 — Min 7-word requirement** on MC responses. Extend `VALIDATION` (`apps/mass-consensus/src/constants/common.ts:34`) + submit validation (`app/api/statements/[id]/submit/route.ts:110`, `proposalController.ts:31`). Add word-count check + i18n message.
- [ ] **T1.2 — Reword "inappropriate content"** to explain what the system is doing. Message origin: moderation reject path (`functions/src/services/moderation-log-service.ts`, `ai-service.ts:186`), surfaced in MC submit. i18n all languages.
- [ ] **T1.3 — Moderation over-sensitivity** (Hebrew/cultural terms like "Bedouins" flagged by US-PC standards) + **too many admin alerts**. Tune the Gemini moderation prompt (`functions/src/services/ai-service.ts:186-280`, `fn_profanityChecker.ts`); throttle/aggregate admin notifications.
- [ ] **T1.4 — Emoji reactions** (heart / smiley / like) replacing like/dislike. Config already exists: `RATING_CONFIG`/`ZONE_CONFIG` emoji (`apps/mass-consensus/src/constants/common.ts:147-195`), `RatingIcon.tsx`, `SwipeCard.tsx`, `RatingButtons.tsx`.
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

