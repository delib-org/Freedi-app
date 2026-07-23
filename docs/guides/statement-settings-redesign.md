# Statement Settings Page — Redesign Specification

**Status:** Approved design spec, ready for implementation
**Scope:** `src/view/pages/statement/components/settings/` (main app)
**Owner request:** "At the top there should be INSTANT settings — like changing from voting to evaluating, type of evaluating (-1 to 1) or (0 to 1). Make it much clearer and easy to use."

---

## 1. Design summary (one paragraph)

The page becomes **one hero panel + six flat groups**. The hero ("Instant Settings") is always visible, never collapses, and owns the single source of truth for *how participants engage*: participation mode (rate / vote / approve / group) and, when relevant, the rating scale (−1..1, ±1, 0..1, Community Voice), plus three high-frequency toggles. Everything else lives in six single-level collapsible groups with plain-language names. The duplicate evaluation controls in "General Settings → Evaluation & Voting" are **deleted**. All controls save instantly with a per-control "Saved ✓" confirmation; the only explicit Save button remains inside the "Question & Description" group, scoped visually to that group alone.

---

## 2. Page anatomy (top to bottom)

```
┌─────────────────────────────────────────────┐
│ Page header: "Settings — {question title}"  │
│ caption: "Changes save automatically ✓"     │
├─────────────────────────────────────────────┤
│ ★ HERO: Instant Settings (always open)      │
├─────────────────────────────────────────────┤
│ Anchor chips: [Question] [Participation]    │
│ [Results] [AI] [Members] [Advanced]         │  ← horizontal scroll on mobile
├─────────────────────────────────────────────┤
│ 1. Question & Description   (Save button)   │
│ 2. Participation Rules                      │
│ 3. Results & Decision                       │
│ 4. AI & Smart Features                      │
│ 5. Members & Access                         │
│ 6. Data & Advanced                          │
└─────────────────────────────────────────────┘
```

Rules:
- Exactly **one level** of collapse (the six groups use the existing `SettingsSection`). The nested accordion inside "General Settings" (`EnhancedAdvancedSettings` categories) is dismantled — its contents redistribute into the groups below.
- The hero never collapses and renders before any accordion.
- Anchor chips scroll-to-group (plain `scrollIntoView`); they are navigation, not state.

---

## 3. The "Instant Settings" hero panel

### 3.1 Contents (exactly these, in this order)

#### A. Participation mode — segmented control (existing `MultiSwitch`)

**Label:** "How do participants respond?"
**Helper:** "This changes the main screen everyone sees."

| Segment label | Icon | Writes | Helper (tooltip / sub-caption) |
|---|---|---|---|
| **Rate ideas** | SuggestionsIcon | `evaluationSettings.evaluationUI = 'suggestions'` | "Everyone scores each suggestion" |
| **Vote for one** | VotingIcon | `= 'voting'` | "Each person picks a single option" |
| **Approve** | ConsentIcon | `= 'checkbox'` | "Check every option you accept" |
| **Group similar** | ClusterIcon | `= 'clustering'` | "Sort ideas into clusters together" |

- Renames: ~~"Like-mindedness"~~ → **Rate ideas**; ~~"Cluster"~~ → **Group similar**.
- On change, reuse the existing `handleEvaluationTypeChange` logic from `QuestionSettings.tsx` verbatim (writes `evaluationUI`, derives `evaluationType` + `enhancedEvaluation`). Move that handler into a shared controller function (e.g. `setParticipationMode()` in `src/controllers/db/evaluation/setEvaluation.ts`) so hero and any future caller share one code path.
- Mobile: the 4 segments wrap to a 2×2 grid (`grid-template-columns: repeat(2, 1fr)` under the mobile mixin). Never shrink labels below 0.875rem.

#### B. Rating scale — segmented control, **conditionally rendered**

Shown **only when participation mode = Rate ideas** (in vote/approve modes the scale is derived automatically — showing it would reintroduce today's confusion). When hidden, render a one-line caption in its place: *"Rating scale is set automatically for this mode."* so the panel doesn't silently reshape.

**Label:** "Rating scale"
**Helper:** "What each participant taps on a suggestion."

| Segment label | Writes `statementSettings.evaluationType` | Helper |
|---|---|---|
| **Agree – Disagree** | `range` | "5 faces, from strongly against to strongly for (−1 to +1)" |
| **Thumbs up / down** | `likeDislike` | "Simple +1 / −1" |
| **Likes only** | `singleLike` | "Positive-only, 0 or 1 — no downvotes" |
| **Community Voice** | `communityVoice` | "4-level 'how much does this resonate' scale" |

- Renames: ~~"5-Point Scale"~~ → **Agree – Disagree**; ~~"Simple Scale"~~ → **Thumbs up / down**; ~~"Like Only"~~ → **Likes only**.
- On change, reuse `handleRatingScaleChange` (also writes `enhancedEvaluation`), moved to the same shared controller.
- The existing `RatingScaleButtons` component can be reused as-is for this row.
- The "Emoji reactions" sub-toggle (`ratingMode: 'reactions' | 'agree-disagree'`) appears **directly under this control, only when Agree – Disagree is selected**, as a small toggle: label **"Use emoji reactions"**, helper "Show playful emoji instead of agree/disagree faces."

#### C. Three quick toggles (existing `ToggleSwitch`), one row (stacked on mobile)

| Toggle label | Helper | Writes |
|---|---|---|
| **Accepting responses** | "Off = participants can see but not rate or vote" | `statementSettings.enableEvaluation` |
| **Discussion chat** | "Let participants talk in a chat alongside the question" | `statementSettings.hasChat` |
| **Show live results** | "Participants see scores while responding (may bias them)" | `statementSettings.showEvaluation` |

That is the entire hero. Nothing else may be added to it without removing something — the hero's value is its smallness. (Deadline, Hide, AI, etc. all have homes below.)

### 3.2 Hero visual treatment

```scss
// InstantSettings.module.scss
.instantSettings {
  background: var(--card-default);
  border-radius: 12px;                       // one step above the 8px group cards
  box-shadow: 0px 3px 6px #4162862b;          // "elevated" tier from design guide
  border-inline-start: 4px solid var(--btn-primary);  // logical property → RTL-safe
  padding: calc(var(--padding) * 1.25);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;                                // section spacing token

  &__title {
    color: var(--text-title);
    font-size: 1.125rem;                      // h4 scale
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  &__fieldLabel {
    color: var(--text-title);
    font-weight: 500;
  }

  &__helper {
    color: var(--text-caption);
    font-size: 0.8125rem;
    margin-block-start: 0.25rem;
  }
}
```

- Hero title: **"Instant Settings"** with a Zap (⚡) lucide icon; sub-caption "The settings you change most — saved the moment you tap."
- Group cards below use the standard flat card (`var(--card-default)`, 8px radius, `0px 3px 6px rgba(115,138,191,.1)` resting shadow) so the hero is visibly one elevation tier higher.
- Do **not** use color-fill backgrounds for the hero (keeps WCAG AA contrast trivial and dark-mode-proof); differentiation comes from elevation + the primary accent bar + never collapsing.

---

## 4. New information architecture — the six groups

Single source of truth rule: **each Firestore field is controlled from exactly one place on this page.** The table below is exhaustive; every existing control either has a destination or is marked **REMOVE (duplicate)**.

### Group 1 — Question & Description
*Icon: Pencil. Default: expanded. Helper: "The question text everyone sees."*

| Control | From |
|---|---|
| Title + description editor (`TitleAndDescription`) | current section 1 |
| Image upload (`UploadImage`) | current section 1 |
| **Save button** (this group only) | current global Save |

The Save button lives **inside this card**, bottom-aligned, `btn btn--primary`, with caption above it: *"Only the question text and image need saving — everything else on this page saves automatically."* This kills the mixed-save-model confusion by scoping the button visually.

### Group 2 — Participation Rules
*Icon: Users. Helper: "What participants are allowed to do."*

| Control | New label + helper | From |
|---|---|---|
| `askUserForASolutionBeforeEvaluation` | **"Ask for their own idea first"** — "Participants must suggest before they can rate others" | QuestionSettings |
| `isSubmitMode` | **"Collect ideas only (no rating yet)"** — "Gather suggestions now, open rating later" | EvaluationSettings |
| `enableAddEvaluationOption` | **"Participants can add suggestions while rating"** | ParticipationSettings |
| `enableAddVotingOption` | **"Participants can add options during voting"** | ParticipationSettings |
| Vote limit (`maxVotesPerUser` + on/off) | **"Limit votes per person"** — "Cap how many options each person can vote for" | EvaluationSettings |
| `VotingSettings` block (shown when mode = voting) | unchanged | QuestionSettings |
| `joiningEnabled` | **"Let people join an option's team"** | ParticipationSettings |
| Option Rooms (`OptionRooms`) | **"Breakout rooms per option"** | current section 10 |
| `hasChildren` | **"Allow sub-conversations"** | ParticipationSettings |
| `enableAddNewSubQuestionsButton` | **"Participants can add sub-questions"** | NavigationSettings |
| Join form (`JoinFormSettings`) / Join resolution (`JoinResolutionSettings`) | unchanged labels | QuestionSettings |

### Group 3 — Results & Decision
*Icon: BarChart3. Helper: "How results are shown and how the winner is chosen."*

| Control | New label + helper | From |
|---|---|---|
| ChoseBy cutoffs (`ChoseBySettings`) | **"How winners are selected"** — "Set cutoffs for which options are chosen" | current section 6 |
| `inVotingGetOnlyResults` | **"Show top results only"** — "Participants see winners, not full tallies" | EvaluationSettings |
| Deadline timer (`DeadlineSettings`) | **"Deadline countdown"** — "Show a visible countdown to all participants" | current section 7 |
| Confidence index (`ConfidenceIndexSettings`) | **"Sample representativeness"** — "Estimate how well responders represent the group" | QuestionSettings |
| Anchored options (`AnchoredSettings`) | **"Anchor suggestions"** — "Fixed suggestions everyone rates, for comparable results" | QuestionSettings |

*(Live result visibility itself — `showEvaluation` — is in the hero and does NOT repeat here.)*

### Group 4 — AI & Smart Features
*Icon: Brain. Helper: "Optional AI help. Everything here is off unless you turn it on."*

| Control | New label + helper | From |
|---|---|---|
| `enableAIImprovement` | **"AI writing help"** — "AI offers to improve participants' wording" | AISettings / Quick Actions |
| `enableSimilaritiesSearch`, `defaultLookForSimilarities`, `similarityThreshold` | **"Catch duplicate suggestions"** — "Warn people when a similar idea already exists" (threshold slider = "Sensitivity") | AISettings |
| `enableMultiSuggestionDetection` | **"Split multi-idea submissions"** — "Detect when one submission contains several ideas" | AISettings |
| Synthesis panel (`SynthesisPanel`) + `liveSynthEnabled` | **"Merge similar suggestions (Synthesis)"** — "Continuously combine near-identical options" | Synthesis category |
| Clustering admin | unchanged, inside this group | AISettings |
| `popperianDiscussionEnabled`, `popperianPreCheckEnabled`, `activationThreshold` | **"Structured debate mode"** — "Ideas must survive challenges before spreading (advanced)". Sub-toggle: **"Pre-check arguments with AI"** | DiscussionSettings ("Popper-Hebbian Mode" — jargon, renamed) |
| Content moderation log (`ModerationLog`) | **"Blocked content log"** — "See what the AI moderator rejected" | current section 13 |

### Group 5 — Members & Access
*Icon: Shield. Helper: "Who can see this question and who runs it."*

| Control | New label + helper | From |
|---|---|---|
| `hide` | **"Hide this question"** — "Invisible to participants; admins still see it" | VisibilitySettings / Quick Actions |
| Membership settings (`MembershipSettings`, `MembersSettings`) | **"Who can join"** | current section 5 |
| Admins management (`AdminsManagement`) | **"Admins"** — "Add people who can manage this question" | current section 4 |
| Member validation (`MemberValidation`) | **"Entry check"** — "Require verification before participating" | current section 11 |
| Demographics (`UserDemographicSetting`) | **"Ask participants about themselves"** — "Optional demographic questions for analysis" | current section 9 |

### Group 6 — Data & Advanced
*Icon: Settings. Default: collapsed. Helper: "Exports, notifications, language, and rarely-changed setup."*

| Control | New label + helper | From |
|---|---|---|
| Question type select (multiStage / massConsensus / compound) | **"Question format"** — "Changing this changes the whole participant flow" + warning styling (`var(--text-warning)`) | QuestionSettings |
| Mass Consensus link (`QuestionLinkSection`) | **"Mass Consensus link"** | QuestionSettings |
| Email notifications (`EmailNotifications`) | unchanged | current section 12 |
| Data export (`ExportSettings`) + Voters/Evaluators export (`GetVoters`, `GetEvaluators`) | **"Download data"** — "Export suggestions, votes, and evaluations" | ExportSettings + section 14 |
| Daily backup toggle + status | **"Nightly backup"** (keep existing helper about 03:00 + immediate backup) | QuestionSettings |
| `defaultLanguage`, `forceLanguage` | **"Survey language"** / **"Lock language (ignore browser setting)"** | LocalizationSettings |
| `enableNavigationalElements` | **"Show navigation buttons"** | NavigationSettings |
| `enableSubQuestionsMap` | **"Show sub-questions map"** | NavigationSettings |
| `enableTreeView` | **"Tree view of the discussion"** | NavigationSettings |
| `defaultView`, `defaultSortType` | **"Default view"** / **"Default sort order"** | NavigationSettings |
| `isDocument` | **"Treat as document"** — "Show this as a readable document instead of a discussion" | VisibilitySettings |
| Power Follow Me (`powerFollowMe`) | **"Presenter mode (follow my screen)"** — "Move all participants to the page you open" | VisibilitySettings ("Power Follow Me" — jargon, renamed) |

### Removed outright (duplicates / noise)

| Item | Why |
|---|---|
| "Quick Actions" chip bar (Hide / Discussion / Voting / AI) | Superseded by hero toggles + group homes; chips wrote the same fields with no state clarity |
| `EvaluationSettings.tsx` evaluation-type card selector (`EvaluationCard` writing `evaluationType`) | Duplicate of hero rating scale — **the source of the two-places bug** |
| "Enable Voting" toggle in EvaluationSettings (`enableEvaluation`) | In hero as "Accepting responses" |
| "Show Results" toggle in EvaluationSettings (`showEvaluation`) | In hero as "Show live results" |
| "Enable Chat" in ParticipationSettings (`hasChat`) | In hero as "Discussion chat" |
| Evaluation Mode `MultiSwitch` + Rating Scale inside `QuestionSettings` | Moved to hero (component reuse, single handler) |
| `EnhancedAdvancedSettings` header, quick-stats, "X / Y active" counter, nested category accordions, "Essential/Recommended/Advanced" badges | Nested accordion dismantled; stats had no actionable meaning |
| "Emoji reactions" toggle in EvaluationSettings | Moved under hero rating scale (conditional on Agree – Disagree) |

---

## 5. Interaction & feedback model

### 5.1 Instant save, made visible

1. **Page-level promise:** under the page title, a permanent caption: *"Changes save automatically ✓"* (`var(--text-caption)`).
2. **Per-control confirmation:** every instant-save control gets a transient inline badge, not a global toast (toasts at screen edge don't associate with the control you touched, especially on mobile):
   - On successful write: a small **"Saved ✓"** pill fades in next to the control's label (`var(--agree)` text, no background), holds 1.2s, fades out 300ms. Reuse one component: `SavedFlash` (new atom, `saved-flash` block per BEM), triggered by the write promise resolving.
   - Implementation: wrap `setStatementSettingToDB` calls in the settings page with a tiny hook `useInstantSave()` that returns `{ save, flashState }`; controls render `<SavedFlash state={flashState} />`.
   - `@media (prefers-reduced-motion: reduce)`: no fade, badge just appears/disappears.
3. **Optimistic UI:** controls flip immediately (they already do via Redux listener); `SavedFlash` confirms persistence.
4. **Failure:** if the write rejects, the control reverts, and an inline error line appears under it: *"Couldn't save — check your connection and try again"* (`var(--text-error)`), plus `logError` with context per CLAUDE.md. No silent failures.

### 5.2 The one Save button

- Lives only inside **Group 1 (Question & Description)**, styled `btn btn--primary`, full-width on mobile.
- Disabled until title/description/image is dirty; label switches "Saved" → "Save changes" when dirty.
- On save success the button itself shows "Saved ✓" for 1.2s (same visual language as `SavedFlash`).

### 5.3 Mode-change confirmation (the one guarded action)

Switching **participation mode** after evaluations exist changes what participants see mid-flight. If the question already has ≥1 evaluation/vote, show a lightweight inline confirm under the segmented control (not a modal): *"Participants have already responded. Switch to {mode}? Existing responses are kept."* with `[Switch] [Cancel]` buttons. With zero responses, switch instantly with no friction.

---

## 6. Visual hierarchy rules

| Layer | Treatment |
|---|---|
| Hero | 12px radius, elevated shadow (`0px 3px 6px #4162862b`), `border-inline-start: 4px solid var(--btn-primary)`, padding `calc(var(--padding) * 1.25)` |
| Group cards | 8px radius, resting shadow (`0px 3px 6px rgba(115,138,191,0.1)`), `var(--card-default)`, padding `var(--padding)`; `calc(var(--padding) * 1.5)` from tablet up |
| Group headers | h4 scale, `var(--text-title)`, lucide icon 20px, chevron end-aligned (`margin-inline-start: auto`) |
| Field labels | 1rem, weight 500, `var(--text-title)` |
| Helper text | 0.8125rem, `var(--text-caption)`, `margin-block-start: 0.25rem` |
| Vertical rhythm | 8-point grid: 0.5rem within a control, 1rem between controls, 1.5rem between sub-clusters, 2rem between group cards |

**Mobile (mobile-first, facilitators on phones):**
- Hero segments: 2×2 grid; toggles stack vertically full-width; touch targets ≥ 44px.
- Anchor chips row: horizontal scroll, `scroll-snap-type: x proximity`, no wrap.
- Group cards edge-to-edge minus `var(--padding)` gutters.

**RTL (Hebrew/Arabic):**
- Logical properties only: `border-inline-start`, `margin-inline-start`, `padding-inline`, `inset-inline-end`. No `left/right` in new SCSS.
- `MultiSwitch` segment order follows DOM order and flips automatically under `dir="rtl"` — verify the selected-thumb animation uses `inset-inline-start`, not `left`.
- Icons are non-directional (faces, thumbs, users) — no mirroring needed; chevrons in group headers use the rotate-on-expand pattern which is direction-neutral.
- All new strings go through `useTranslation()`; add keys to all language files.

**Accessibility (WCAG AA):**
- Segmented controls: `role="radiogroup"` + `role="radio"`/`aria-checked`; arrow-key navigation.
- `SavedFlash` announces via `aria-live="polite"` ("Saved").
- Selected segment must not rely on color alone: filled background + weight change + check-glyph.

---

## 7. Plain-language label reference (rename map)

| Current (jargon) | New label |
|---|---|
| Like-mindedness | Rate ideas |
| Cluster | Group similar |
| 5-Point Scale | Agree – Disagree |
| Simple Scale | Thumbs up / down |
| Like Only | Likes only |
| Popper-Hebbian Mode | Structured debate mode |
| AI Pre-Check | Pre-check arguments with AI |
| Power Follow Me | Presenter mode (follow my screen) |
| Submit Mode | Collect ideas only (no rating yet) |
| Enable Voting | Accepting responses |
| Show Evaluation / Show Results | Show live results |
| Enable Joining Options | Let people join an option's team |
| Mark as a Document | Treat as document |
| Member Validation | Entry check |
| User Demographics | Ask participants about themselves |
| Enable similarity detection / Auto-check for similar entries | Catch duplicate suggestions |
| Detect multi-idea submissions | Split multi-idea submissions |
| Content Moderation | Blocked content log |
| Question Structure | (dissolved — contents moved to hero / groups) |
| General Settings | (dissolved) |

---

## 8. Implementation notes

**New components** (atomic system, SCSS-first, BEM):
- `InstantSettings` (organism) — `src/view/pages/statement/components/settings/components/instantSettings/InstantSettings.tsx` + `InstantSettings.module.scss`. Composes `MultiSwitch`, `RatingScaleButtons`, `ToggleSwitch`, `SavedFlash`.
- `SavedFlash` (atom) — SCSS in `src/view/style/atoms/_saved-flash.scss`, wrapper in `src/view/components/atomic/atoms/SavedFlash/`.
- `useInstantSave` hook — wraps `setStatementSettingToDB` / `setEvaluationUIType` with flash + error state; error handling via `logError` with `{ operation, statementId, metadata: { property } }`.

**Refactors:**
- Extract `handleEvaluationTypeChange` / `handleRatingScaleChange` from `QuestionSettings.tsx` into `src/controllers/db/evaluation/setEvaluation.ts` (`setParticipationMode`, `setRatingScale`).
- `StatementSettingsForm.tsx` becomes the six-group layout; `EnhancedAdvancedSettings.tsx` is deleted after its sub-components (`VisibilitySettings`, `ParticipationSettings`, `AISettings`, etc.) are re-parented into the new groups (they already receive `handleSettingChange` as a prop — reuse).
- `QuestionSettings.tsx` shrinks to the pieces staying in groups (question type, MC link, join forms, anchored, confidence, backup).

**Order of work (suggested PRs):**
1. `SavedFlash` + `useInstantSave` (isolated, testable).
2. `InstantSettings` hero + removal of the two duplicate evaluation control sites.
3. Regroup remaining sections; delete `EnhancedAdvancedSettings` shell + Quick Actions.
4. Rename pass + translation keys (all 6 languages).

**Testing:** unit tests for `useInstantSave` (success/failure/revert), `setParticipationMode` derived-field logic (voting→singleLike etc.), and an e2e happy path: change mode → reload → mode persisted, only one control on the page reflects `evaluationType`.
