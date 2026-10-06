# Card creation with images — MC admin

Status: Phase 1 implemented (see "Implementation notes" at the end); Phase 1b not built. Branch `feat/mc-swipe-images`, builds on commit
`039b28c0e` (swipe card shows `imagesURL.main`; per-option image API; admin 🖼️ sheet
while swiping).

Tal's brief: "the admin needs a way to add the images easily. In the main app, it is
easy to add images. Build card creation with images in MC."

---

## 1. Recommendation

**Build one component, the `card-list`, and host it in two places:**

1. **Primary path — the create-question wizard, step 3.** The textarea stays exactly as
   it is for text-only work (paste 20 lines, AI "write 6 solutions", Ctrl/Cmd+Enter).
   Underneath it, the preview rows that already exist each gain a *picture well*. The
   moment an admin drops a picture on a row, the list becomes the source of truth
   ("cards mode"): each row is an editable line with its picture. Pictures are uploaded
   **after** the question is created, one request per card through the existing
   `POST /api/statements/[id]/image`, with per-card progress and retry inside the same
   modal.
2. **Secondary path — a "Cards" panel on the existing question row** in the survey
   editor (`UnifiedFlowEditor`, expanded question → under the question-text editor).
   Same `card-list` in *saved* mode: every option of the question is listed with its
   picture well; add / replace / remove / describe saves immediately per card.

**Why the wizard is primary.** It is where Tal asked for it, it is the moment the admin
has the material in hand, and the current step-3 preview list is already 80% of the
UI — adding a picture well to each row is the smallest possible change to what admins
already know. Text-only creation does not change at all (progressive disclosure).

**Why the Cards panel is still required, not optional.** Today MC admin has *no screen
at all* that shows the option cards of an existing question (`SurveyEditView` →
`UnifiedFlowEditor` shows only the ID, a "View in app" link, the text editor and the
settings). Without it, a picture that failed to upload, a question created before this
feature, or a card added by a participant can only be given a picture by swiping to it.
The panel is also the natural place for "the survey is built, now I have the photos".

**Why create-then-upload, not staging.** The per-option API, storage path
(`statements/{optionId}/…`), admin checks, magic-byte validation and old-file cleanup
already exist and are tested. A staging bucket would need a second path, a move step
and garbage collection. Create-then-upload costs one extra phase in the modal and
degrades gracefully: the question and its cards always exist; only pictures can be
missing, and the Cards panel is where they get fixed.

---

## 2. User flows

### 2a. New question with pictures (wizard)

1. Survey editor → "+ Create New Question" → step 1 (group), step 2 (details) unchanged.
2. Step 3 "Add cards". Admin pastes 12 lines into the textarea (or presses ✨ "Write 6
   solutions for me"). Rows appear below, numbered, each with an empty picture well
   (📷 "Add picture"). Nothing else has changed from today.
3. Admin adds pictures, any of these ways:
   - tap/click a row's well → OS file picker (single file);
   - drag one file onto a row → that card;
   - drag *several* files onto the list (or press "Add pictures for all…" → multi-select
     picker) → files are assigned in order to the cards that have no picture yet, from
     the top; a toast says "8 pictures added to cards 1–8";
   - focus a row and paste (Ctrl/Cmd+V) an image from the clipboard.
   The first picture switches the step to *cards mode*: the textarea collapses, each row's
   text becomes an editable input, "+ Add card" and "Paste more lines…" appear.
4. Under each thumbnail an inline field "Describe the picture (recommended)". Optional.
5. "Create question" (was "Create Question"). The modal calls
   `POST /api/questions/create` with `solutions: string[]` (unchanged contract), then
   enters the **Uploading pictures** phase: the same rows, now each with a status
   (queued → uploading → done / failed). Overall counter "3 of 8 pictures uploaded".
6. On a failed card: inline reason ("Too large (max 5 MB)", "Not a supported image",
   "Upload failed — check your connection") and a **Retry** button; a "Retry all failed"
   button appears in the footer when ≥ 2 failed.
7. "Done" is enabled as soon as the create succeeded (pictures are never a blocker).
   Closing with failed cards shows one line: "2 cards have no picture yet. You can add them
   any time from the survey editor." The question is already in the survey list.

### 2b. Adding pictures to an existing question's cards (survey editor)

1. Admin → survey → **Edit** tab → expand the question row.
2. New collapsible section under the question text: **Cards (12)**. Opens on click and
   loads `GET /api/questions/[id]/cards`.
3. Each card row: thumbnail or empty well, card text, description field, ⋯ menu
   (Replace picture / Remove picture / Preview card).
4. Adding a picture (tap, drop, multi-drop-in-order, paste) uploads **immediately** via
   `POST /api/statements/[id]/image` with `surveyId`; the row shows a spinner then the
   new thumbnail. Description edits are saved on blur (same endpoint, no file).
5. Remove → row asks "Remove this picture?" inline (Remove / Keep) → `DELETE`.
6. "+ Add card" (phase 1b) → new empty row with focus in the text input; blur or Enter
   creates the option via `POST /api/questions/[id]/cards`; a picture can then be added
   to it like any other row.

### 2c. During swiping (unchanged)

The admin 🖼️ button and `CardImageModal` stay as they are; they become the "quick fix
while looking at it" path.

---

## 3. Wireframes

Legend: `[📷]` empty picture well, `[img]` thumbnail, `(…)` button, `⋯` overflow menu.
RTL mirrors horizontally (wells sit at inline-start, i.e. on the right in Hebrew).

### 3.1 Wizard step 3 — write mode (mobile 390 px)

Identical to today except the wells in the preview rows and the "Add pictures for all"
action.

```
┌──────────────────────────────────────┐
│ ✓ Group ─── ✓ Details ─── ● Cards    │
│                                      │
│ Add cards  (Optional)                │
│ One card per line. Add a picture to  │
│ any card, now or later.              │
│                                      │
│ (✨ Write 6 solutions for me)        │
│ The AI writes starting solutions…    │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ Focus on customer retention      │ │
│ │ Expand to new markets            │ │
│ │ Improve product quality          │ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Preview               3 cards        │
│               (📷 Add pictures for all…)
│ ┌──────────────────────────────────┐ │
│ │ 1 [📷] Focus on customer retention│ │
│ ├──────────────────────────────────┤ │
│ │ 2 [📷] Expand to new markets      │ │
│ ├──────────────────────────────────┤ │
│ │ 3 [📷] Improve product quality    │ │
│ └──────────────────────────────────┘ │
│  Drop pictures here to add them in   │
│  order                               │
│ ☐ Skip – don't add cards now         │
│                                      │
│ (Back)            (Create question)  │
└──────────────────────────────────────┘
```

### 3.2 Wizard step 3 — cards mode (mobile), after the first picture

```
┌──────────────────────────────────────┐
│ ✓ Group ─── ✓ Details ─── ● Cards    │
│                                      │
│ Add cards                 3 cards    │
│ (📷 Add pictures for all…) (Paste more lines…)
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 1 ┌────┐ Focus on customer       │ │
│ │   │img │ retention___________  ⋯ │ │
│ │   └────┘                          │ │
│ │   Describe the picture (recommended)
│ │   [A shop owner greeting a regular]│
│ ├──────────────────────────────────┤ │
│ │ 2 [📷] Expand to new markets__  ⋯ │ │
│ ├──────────────────────────────────┤ │
│ │ 3 [📷] Improve product quality_ ⋯ │ │
│ │        ⚠ Too large (max 5 MB)     │ │
│ └──────────────────────────────────┘ │
│ (+ Add card)                         │
│                                      │
│ (Back)            (Create question)  │
└──────────────────────────────────────┘
```

Row ⋯ menu: Replace picture · Remove picture · Preview card · Delete card.
Row with a picture expands to show the description field; rows without one stay one
line tall, so 20 text-only cards never get taller than today.

### 3.3 Wizard step 3 — cards mode (desktop ≥ 768 px)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ✓ Group ────────── ✓ Details ────────── ● Cards                      │
│                                                                      │
│ Add cards (Optional)                                        3 cards  │
│ One card per line. Add a picture to any card, now or later.          │
│                                                                      │
│ (✨ Write 6 solutions for me)   (📷 Add pictures for all…)  (Paste more lines…)
│                                                                      │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │ 1 ┌────────┐ Focus on customer retention_______________    ⋯  │   │
│ │   │  img   │ Describe the picture (recommended)               │   │
│ │   │        │ [A shop owner greeting a regular customer______]  │   │
│ │   └────────┘                                                    │   │
│ ├────────────────────────────────────────────────────────────────┤   │
│ │ 2 [  📷  ]   Expand to new markets_________________________ ⋯  │   │
│ │   Add picture                                                   │   │
│ ├────────────────────────────────────────────────────────────────┤   │
│ │ 3 [  📷  ]   Improve product quality______________________  ⋯  │   │
│ └────────────────────────────────────────────────────────────────┘   │
│   Drop pictures anywhere on the list to add them in order            │
│ (+ Add card)                                                         │
│                                                                      │
│ (Back)                                            (Create question)  │
└──────────────────────────────────────────────────────────────────────┘
```

Desktop well: 96 × 64 px (3:2). Mobile well: 56 × 56 px. Both are `button` elements.

### 3.4 Wizard — uploading phase (mobile)

Same rows, read-only, with status. The step indicator stays on "Cards".

```
┌──────────────────────────────────────┐
│ ✓ Group ─── ✓ Details ─── ● Cards    │
│                                      │
│ Question created ✓                   │
│ Uploading pictures  2 of 3           │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░                │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 1 [img] Focus on customer…   ✓   │ │
│ ├──────────────────────────────────┤ │
│ │ 2 [img] Expand to new markets ◌  │ │
│ ├──────────────────────────────────┤ │
│ │ 3 [img] Improve product…   ⚠     │ │
│ │   Upload failed — check your     │ │
│ │   connection            (Retry)  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ (Retry all failed)          (Done)   │
└──────────────────────────────────────┘
```

Cards without a picture are not listed in this phase (they have nothing to upload);
the header says "Uploading pictures 2 of 3" counting only cards with a picture.

### 3.5 Survey editor — Cards panel in the expanded question row (mobile)

```
┌──────────────────────────────────────┐
│ ▼ Question  What should we improve?  │
│   ID: q_17… · View in app            │
│   Question text                      │
│   ┌──────────────────────────────┐   │
│   │ What should we improve?      │   │
│   └──────────────────────────────┘   │
│                                      │
│   ▼ Cards (12)                       │
│   (📷 Add pictures for all…)         │
│   ┌──────────────────────────────┐   │
│   │ 1 [img] Better parking    ⋯  │   │
│   │   Describe the picture       │   │
│   │   [Cars in a full car park_] │   │
│   ├──────────────────────────────┤   │
│   │ 2 [📷] More bike lanes    ⋯  │   │
│   ├──────────────────────────────┤   │
│   │ 3 [◌ ] Night buses        ⋯  │   │
│   │   Uploading…                 │   │
│   ├──────────────────────────────┤   │
│   │ …                            │   │
│   └──────────────────────────────┘   │
│   (+ Add card)                       │
│                                      │
│   Settings for this question         │
│   …                                  │
└──────────────────────────────────────┘
```

### 3.6 Survey editor — Cards panel (desktop)

```
│   ▼ Cards (12)                                     (📷 Add pictures for all…)
│   ┌──────────────────────────────────────────────────────────────────┐
│   │ 1 ┌──────┐ Better parking                                   ⋯   │
│   │   │ img  │ Describe the picture (recommended)                    │
│   │   └──────┘ [Cars in a full car park____________________] Saved ✓ │
│   ├──────────────────────────────────────────────────────────────────┤
│   │ 2 [  📷  ] More bike lanes                                   ⋯   │
│   ├──────────────────────────────────────────────────────────────────┤
│   │ 3 [  ◌   ] Night buses                          Uploading…   ⋯   │
│   └──────────────────────────────────────────────────────────────────┘
│   Drop pictures anywhere on the list to add them in order
│   (+ Add card)
```

Card text in saved mode is static (editing option text is out of scope here; the
existing `PATCH /api/statements/[id]` has no admin check and should be fixed before it
is exposed in admin UI).

### 3.7 Picture well — states (atom)

```
empty          hover/drag-over    chosen (draft)     uploading       done           error
┌──────┐       ┏━━━━━━┓           ┌──────┐           ┌──────┐        ┌──────┐       ┌──────┐
│  📷  │       ┃  ⤓   ┃           │ img  │           │ img  │        │ img  │       │  ⚠   │
│ Add  │       ┃ Drop ┃           │      │           │  ◌   │        │  ✓   │       │      │
└──────┘       ┗━━━━━━┛           └──────┘           └──────┘        └──────┘       └──────┘
                                                                                     Too large
                                                                                     (max 5 MB)
```

### 3.8 Card preview (optional, phase 1b)

Worth building, cheaply: the swipe card crops the picture (`object-fit: cover`, at most
half the card height), which surprises people who upload tall or wide images. A static
render of the real card answers "will my picture be cut?" in one tap.

```
┌──────────────────────────────────────┐
│ Preview                          ×   │
│                                      │
│      ┌──────────────────────┐        │
│      │ 1                    │        │
│      │ ┌──────────────────┐ │        │
│      │ │      picture     │ │        │
│      │ └──────────────────┘ │        │
│      │  Focus on customer   │        │
│      │  retention           │        │
│      └──────────────────────┘        │
│  This is how participants see the    │
│  card. The picture is cropped to fit.│
└──────────────────────────────────────┘
```

Implementation: a `CardPreview` component that renders the same DOM/classes as
`SwipeCard` (`swipe-card swipe-card--with-image swipe-card--preview`) with no gesture
handlers, inside a small centered dialog. `--preview` only removes `cursor: grab` and
`touch-action: none`. No new visual design, so it cannot drift from the real card.

---

## 4. Component breakdown

### 4.1 New files

| File | Kind | Responsibility |
|---|---|---|
| `src/components/admin/CardList/CardList.tsx` (+ `index.ts`) | molecule wrapper | Renders rows from `CardDraft[]` / saved cards; list-level drop target (multi-file in order), "Add pictures for all…", "+ Add card", "Paste more lines…". Props: `mode: 'draft' \| 'saved'`, `cards`, `onChange`, `onAttach(cardKey, file)`, `onRemovePicture`, `onAltChange`, `onRetry`, `statuses`. |
| `src/components/admin/CardList/CardRow.tsx` | molecule part | One row: number, `PictureWell`, text (input in draft mode, static in saved mode), description field, status line, ⋯ menu. |
| `src/components/admin/CardList/PictureWell.tsx` | atom wrapper | The tap/drop/paste target with thumbnail and state. Reusable later by `CardImageModal`. |
| `src/components/admin/CardList/useCardDrafts.ts` | hook | Draft state for the wizard: `fromTextarea(lines)`, `appendLines`, `attach`, `assignFilesInOrder`, `remove`, `setAlt`, `hasAnyPicture`, `toSolutions()`. |
| `src/lib/utils/cardDrafts.ts` (+ `__tests__/cardDrafts.test.ts`) | pure utils | `linesToDrafts`, `draftsToLines`, `assignFilesInOrder(drafts, files)`, `checkDraftFile` (wraps `checkCardImageFile`), problem → i18n key mapping. |
| `src/controllers/cardUploadQueue.ts` (+ `__tests__`) | controller | Runs `uploadCardImage` for `{statementId, file, alt}[]` with concurrency 3, per-item status callbacks, `retry(keys)`. Errors go through `logError` with `operation: 'cardUploadQueue.upload'`, `statementId`. |
| `src/controllers/questionCardsController.ts` | controller | `fetchQuestionCards(questionId, surveyId?)`, `createQuestionCards(questionId, texts, surveyId?)` (1b). |
| `src/components/admin/QuestionCardsPanel/QuestionCardsPanel.tsx` | organism | Collapsible "Cards (n)" section for one existing question; loads cards, hosts `CardList` in saved mode, saves each change immediately, shows per-row status. |
| `src/lib/auth/questionCardsAccess.ts` | server | `canEditQuestionCards(userId, questionId, surveyId?)`: admin of the question, or editor of a survey whose `questionIds` include it. `cardImageAccess.canEditCardImage` becomes a one-line call to it with `option.parentId`. |
| `app/api/questions/[id]/cards/route.ts` | API | `GET` list options (admin), `POST` create text-only options (1b). See §4.4. |
| `src/styles/atoms/_picture-well.scss` | SCSS | `.picture-well` block. |
| `src/styles/molecules/_card-list.scss` | SCSS | `.card-list` block (rows, statuses, drop hint, progress). |
| `src/styles/molecules/_question-cards-panel.scss` | SCSS | `.question-cards-panel` block (header, count, collapse). |
| `src/components/swipe/CardPreview/CardPreview.tsx` + `src/styles/molecules/_card-preview.scss` | 1b | Static swipe-card render in a dialog. |

### 4.2 Changed files

| File | Change |
|---|---|
| `src/components/admin/CreateQuestionModal/CreateQuestionModal.tsx` | Step 3 replaces `solutionsPreview` with `CardList` (draft mode) driven by `useCardDrafts`; textarea remains and feeds `fromTextarea` while `!hasAnyPicture`; new `phase: 'form' \| 'uploading'`; after `POST /api/questions/create` maps `response.solutions[i]` to `drafts.filter(nonEmpty)[i]` (the route creates them in the order sent, so the client must send `toSolutions()` and use the same filtered array for mapping) and runs `cardUploadQueue`. Calls `onQuestionCreated(question)` **immediately after create**, `onClose()` on Done. Ctrl/Cmd+Enter still creates. |
| `src/components/admin/CreateQuestionModal/CreateQuestionModal.module.scss` | Remove `.solutionsPreview*` / `.previewItem*` once `CardList` replaces them; add nothing new (new UI is BEM in `src/styles`). |
| `src/components/admin/SurveyForm.tsx` | `onQuestionCreated` no longer sets `isCreateQuestionModalOpen(false)`; the modal closes itself through `onClose` when the upload phase ends (or right away when there are no pictures). |
| `src/components/admin/UnifiedFlowEditor.tsx` | In the expanded question content, render `<QuestionCardsPanel questionId surveyId />` between `QuestionTextEditor` and `QuestionSettingsPanel`. Hidden when the survey has no id yet (new survey not saved). |
| `src/lib/auth/cardImageAccess.ts` | Delegate to `canEditQuestionCards(userId, option.parentId, surveyId)`. |
| `src/styles/atoms/_index.scss`, `src/styles/molecules/_index.scss` | `@import 'picture-well'`, `@import 'card-list'`, `@import 'question-cards-panel'` (+ `card-preview` in 1b). |
| `packages/shared-i18n/src/languages/{en,he,ar,de,es,fa,nl}.json` | Keys in §6. |

Unchanged and reused: `app/api/statements/[id]/image/route.ts` (POST/DELETE/GET),
`src/lib/firebase/cardImageAdmin.ts`, `src/lib/utils/cardImage.ts`,
`src/controllers/cardImageController.ts` (`uploadCardImage`, `deleteCardImage`),
`src/constants/common.ts` (`CARD_IMAGE`), `app/api/questions/create/route.ts` (no contract
change), `app/api/ai/suggest-solutions`, `CardImageModal` (still used while swiping).

### 4.3 BEM names

```
.picture-well                     button; also the drop target and paste target
  &--empty | &--filled | &--dragover | &--uploading | &--done | &--error | &--disabled
  &__thumb                        <img>, object-fit: cover, 3:2 desktop, 1:1 mobile
  &__icon                         📷 / ⤓ / ⚠ (aria-hidden)
  &__label                        "Add picture" / "Drop" (visually hidden on mobile filled)
  &__spinner                      indeterminate ring
  &__input                        hidden <input type=file> (sr-only, tabIndex -1)

.card-list
  &--draft | &--saved | &--dragover | &--busy
  &__toolbar                      "Add pictures for all…", "Paste more lines…", count
  &__count
  &__rows                         <ol>
  &__row                          <li>; &--error | &--uploading | &--done | &--new
  &__number
  &__text                         <input> in draft mode
  &__text-static                  <p dir="auto"> in saved mode
  &__alt                          <input> description
  &__alt-label
  &__status                       "Uploading…", "Saved ✓", "Queued"
  &__error                        role="alert" text + Retry
  &__menu                         ⋯ button; &__menu-item
  &__add                          "+ Add card"
  &__drop-hint                    "Drop pictures anywhere on the list to add them in order"
  &__progress                     upload-phase bar; &__progress-fill; &__progress-label
  &__paste-more                   the small secondary textarea (draft mode)
  &__empty                        "No cards yet"

.question-cards-panel
  &__header                       collapsible button, "Cards (12)"
  &__body
  &__loading | &__error | &__empty

.card-preview (1b)
  &__dialog | &__close | &__stage | &__caption
```

Tokens only: `var(--card-default)`, `var(--btn-primary)`, `var(--btn-secondary)`,
`var(--text-heading)`, `var(--text-body)`, `var(--text-muted)`, `var(--rating-neutral)`
(neutral borders, as `_card-image-modal.scss` does), `var(--rating-strongly-disagree-border)`
for errors, `var(--rating-agree)` for done, `var(--spacing-*)`, `var(--shadow-md)`.
Row height ≥ 56 px, every tappable target ≥ 44 px.

### 4.4 APIs

**Reused**

- `POST /api/questions/create` — unchanged. Response already returns `solutions:
  Statement[]` in the order the texts were sent; the client relies on that order.
- `POST /api/statements/[id]/image` (multipart `file`, `alt`, `surveyId?`) — one call per
  card, both in the wizard and in the panel. Without `file` it updates only `alt`.
- `DELETE /api/statements/[id]/image?surveyId=` — remove.
- `GET /api/statements/[id]/image` — not needed by the new screens (admin status is known).

**New (minimal): `app/api/questions/[id]/cards/route.ts`**

```
GET /api/questions/[id]/cards?surveyId=
  auth: bearer; canEditQuestionCards(userId, id, surveyId) else 403
  → 200 { cards: Statement[] }      options with parentId == id, statementType == option,
                                     hide != true, sorted by createdAt asc (creation order,
                                     which is what the admin typed), no limit needed
                                     (admin-built lists are small; cap at 500)

POST /api/questions/[id]/cards            (phase 1b)
  body: { texts: string[], surveyId?: string }
  auth as above; texts trimmed, non-empty, ≤ VALIDATION.MAX_STATEMENT_LENGTH
  → 201 { cards: Statement[] }      built with createStatementObject exactly as
                                     /api/questions/create does — extract that loop into
                                     src/lib/firebase/buildOptionStatements.ts and use it
                                     from both routes
```

`getAllSolutionsSorted` in `queries.ts` is not reused: it sorts by agreement and applies
`sanitizeStatement`; the admin list must be in creation order with `imagesURL` intact.

No new storage rules, no new Firestore indexes (`parentId + statementType` is already
queried by `getAllSolutionsSorted`).

### 4.5 Data model (client only)

```ts
interface CardDraft {
  key: string;            // stable id for React keys and file assignment (getRandomUID)
  text: string;
  file: File | null;
  previewUrl: string | null;   // URL.createObjectURL(file); revoked on remove/unmount
  alt: string;
  problem: CardImageProblem | null;   // client-side validation result
}

type UploadStatus = 'idle' | 'queued' | 'uploading' | 'done' | 'failed';
```

Files never leave memory until the question exists. Object URLs are revoked when a
draft loses its file and on modal close. Wizard state resets on open as today.

---

## 5. States and behaviour

### 5.1 Step 3, write mode (no picture yet)

- Textarea is the source of truth; rows are derived on every keystroke (as the preview is
  today). Pasting 20 lines is as fast as now.
- ✨ AI button appends to the textarea (unchanged).
- Each row shows an empty well. Tap / drop / paste on a well → attaches a file → switch to
  cards mode. Dropping several files on the list → assign in order → cards mode.
- "Skip – don't add cards now" disables the textarea and the list (as today).

### 5.2 Step 3, cards mode

- Rows are the source of truth. Row text is an `<input>`; Enter in a row inserts a new row
  after it; Backspace in an empty row removes it and focuses the previous one (so keyboard
  authors keep the "one per line" feel). Empty rows are dropped on create.
- "Paste more lines…" reveals a small textarea; each non-empty line becomes a new row on
  blur or on its "Add lines" button.
- ✨ AI button appends generated lines as new rows.
- "Back to text" exists only while no row has a picture (i.e., all pictures were removed);
  otherwise it is not shown. There is no destructive mode switch.
- Row ⋯ menu: Replace picture / Remove picture / Preview card (1b) / Delete card.
- Well validation runs client-side with `checkCardImageFile` the moment a file is chosen:
  - `size` → "Too large (max 5 MB)"
  - `type`/`empty` → "Not a supported image. Use PNG, JPG, WebP or GIF"
  The file is not attached; the row shows the error until the next successful pick.
- Description field appears only for rows with a picture; placeholder "Describe the
  picture (recommended)"; `maxLength = CARD_IMAGE.ALT_MAX_LENGTH`; never blocks.
- Multi-file assignment: files → cards without a picture, top to bottom. If there are more
  files than empty cards, the extra files are ignored and a toast says "3 pictures were not
  used — there were more pictures than cards". Files that fail validation are skipped with
  their own toast line.

### 5.3 Uploading phase (wizard)

- Trigger: create succeeded and ≥ 1 draft has a file. With no files, the modal behaves as
  today (`onQuestionCreated` then `onClose`).
- Header: "Question created ✓" then "Uploading pictures {done} of {total}" with a
  determinate bar by count (the fetch-based controller gives no byte progress; per-card
  byte progress would need XHR and is not worth it for ≤ 5 MB files).
- Concurrency 3. Each row: queued → uploading (spinner in the well) → done (✓) or failed
  (⚠ + reason + Retry). Reasons: server 400 `size`/`type`/`content` → same copy as above,
  "content" → "This file is not a supported image"; network/5xx → "Upload failed — check
  your connection".
- Footer: "Retry all failed" (when ≥ 2 failed) and "Done". Done is always enabled; the
  survey already has the question. Esc and backdrop click are ignored while any upload is
  in flight (mirrors `CardImageModal`), otherwise they act as Done.
- If the admin closes with failures, one line under the header: "{n} cards have no picture
  yet. You can add them any time from the survey editor."

### 5.4 Cards panel (saved mode)

- Collapsed by default; header shows the count once loaded ("Cards (12)"), "Cards" before.
- Loading: three skeleton rows. Error: "Couldn't load the cards" + Retry. Empty: "No cards
  yet" + "+ Add card" (1b) or, without 1b, "Participants' suggestions and cards added in the
  main app appear here."
- Attach → immediate upload → well spinner → thumbnail. Failure → row error + Retry, the
  previous picture stays.
- Description saved on blur when changed; "Saved ✓" fades after 2 s.
- Remove → inline confirm in the row ("Remove this picture?" Remove / Keep) → `DELETE`.
- Multi-drop in order works the same way; each file starts its own upload.
- The panel never blocks the survey form's own Save; it has no unsaved state of its own.

### 5.5 Responsive

- Mobile (< 768 px): well 56 × 56, number above the well is replaced by a small badge on
  the well's corner, text input full width on the next line, ⋯ at inline-end. Rows without
  a picture are one line tall. Toolbar buttons wrap; "Add pictures for all…" is full width.
- Desktop: well 96 × 64 at inline-start, text and description to its side, ⋯ at inline-end.
  List max-width follows the modal (500 px) / editor column.
- No horizontal scroll at 320 px.

### 5.6 RTL (he, ar, fa)

- Only logical properties: `inset-inline-start/end`, `margin-inline-*`, `padding-inline-*`,
  `border-inline-start`. Wells sit at inline-start (right in RTL); ⋯ at inline-end.
- Card text inputs, static text and description use `dir="auto"` (mixed-language surveys
  are common). Numbers in `&__number` stay Latin digits, as `swipe-card__number` does.
- Progress bar fills from inline-start (`transform-origin: 0 50%` is wrong in RTL; use
  `inline-size` on the fill).
- The drop-hint and toasts are plain sentences, no directional arrows; the drag icon ⤓ is
  vertical.

### 5.7 Keyboard and screen reader

- `PictureWell` is a `<button>` with `aria-label`: empty → "Add picture to card 3: Improve
  product quality"; filled → "Change picture of card 3". Enter/Space opens the picker. The
  `<input type=file>` is `sr-only`, `tabIndex -1`, `aria-hidden`.
- Drop targets are additive; everything reachable by drop is reachable by the button and by
  "Add pictures for all…" (multi-select picker).
- Paste: the list container has `onPaste`; when the event contains an image item it is
  attached to the focused row's card or, with focus on the list itself, to the first card
  without a picture. Text paste into a row input is untouched.
- Rows are `<li>` in an `<ol>`, so a screen reader announces "3 of 12". Row status lives in
  a visually hidden `aria-live="polite"` region at list level ("Picture added to card 3",
  "Uploading 2 of 8", "Card 3 upload failed: too large") — one region, not one per row, to
  avoid a burst of announcements on multi-drop.
- Errors: `role="alert"` on the row error text; the Retry button is inside it.
- The ⋯ menu is a `menu`/`menuitem` popover with arrow-key navigation and Esc; the
  preview dialog traps focus and returns it to the ⋯ button.
- Thumbnails: `alt` = the description if present, else "" (decorative in the editor; the
  text next to it carries the meaning). On the swipe card the existing `imagesURL.alt`
  behaviour is unchanged.
- Contrast: status and hint text use `var(--text-muted)` on `var(--card-default)` only
  where it already passes AA in the app; error text uses the same token as
  `card-image-modal__error`.
- `prefers-reduced-motion`: no spinner rotation (static ring), no thumbnail fade-in.

---

## 6. Copy and i18n keys

MC's recent card-image work uses the English sentence as the key (e.g. `"Card image"`),
while the older wizard uses camelCase keys. New strings follow the sentence convention;
existing wizard keys that change meaning get a new key rather than a silent edit. All keys
must be added to `en, he, ar, de, es, fa, nl`. `{{n}}`, `{{count}}`, `{{from}}`, `{{to}}`
via `tWithParams`.

| Key (English) | Where |
|---|---|
| `Add cards` | step-3 title (replaces `initialSolutions` "Add Initial Solutions") |
| `One card per line. Add a picture to any card, now or later.` | step-3 description (replaces `initialSolutionsDesc`) |
| `Skip – don't add cards now` | step-3 checkbox (replaces `skipSolutions`) |
| `Create question` | footer (replaces `createQuestion` casing; keep old key if used elsewhere) |
| `{{count}} cards` / `1 card` | count badge (`Cards count` with plural handled as today: `card` / `cards`) |
| `Add picture` | empty well label |
| `Change picture` | filled well label |
| `Add picture to card {{n}}: {{text}}` | well aria-label, empty |
| `Change picture of card {{n}}` | well aria-label, filled |
| `Drop` | well drag-over label |
| `Add pictures for all…` | toolbar button |
| `Drop pictures anywhere on the list to add them in order` | list drop hint |
| `Drop pictures here to add them in order` | mobile drop hint |
| `{{count}} pictures added to cards {{from}}–{{to}}` | toast after multi-drop |
| `{{count}} pictures were not used — there were more pictures than cards` | toast |
| `{{count}} files were skipped — not supported images` | toast |
| `Paste more lines…` | toolbar |
| `Add lines` | paste-more textarea button |
| `Back to text` | cards mode, only when no pictures |
| `+ Add card` | list footer |
| `Card text` | aria-label for the row text input |
| `Describe the picture (recommended)` | description placeholder |
| `Picture description` | description aria-label |
| `Too large (max 5 MB)` | validation |
| `Not a supported image. Use PNG, JPG, WebP or GIF` | validation |
| `Upload failed — check your connection` | network / 5xx |
| `Retry` | row |
| `Retry all failed` | footer |
| `Replace picture` | ⋯ menu |
| `Remove picture` | ⋯ menu (existing key `Remove image` stays for `CardImageModal`) |
| `Remove this picture?` / `Keep` | inline confirm (reuse `Remove` if it exists) |
| `Preview card` | ⋯ menu (1b) |
| `Delete card` | ⋯ menu, draft mode |
| `Card options` | ⋯ button aria-label |
| `Question created` | upload phase header |
| `Uploading pictures {{done}} of {{total}}` | upload phase |
| `Queued` / `Uploading…` / `Saved` | row status (reuse `Uploading...` if it exists) |
| `{{count}} cards have no picture yet. You can add them any time from the survey editor.` | upload phase, on close with failures |
| `Done` | upload phase footer |
| `Cards` | panel header before count |
| `Cards ({{count}})` | panel header |
| `Couldn't load the cards` | panel error |
| `No cards yet` | panel empty |
| `Participants' suggestions and cards added in the main app appear here.` | panel empty hint (without 1b) |
| `Picture added to card {{n}}` | live region |
| `Card {{n}} upload failed: {{reason}}` | live region |
| `Preview` / `This is how participants see the card. The picture is cropped to fit.` | preview dialog (1b) |

Hebrew note: "card" → כרטיס, "picture" → תמונה (the existing keys use תמונה); "cards"
plural כרטיסים; keep the imperative infinitive style already used ("בחירת תמונה").

---

## 7. Phasing

- **Phase 1 (this spec's core):** `PictureWell`, `CardList` (draft + saved), wizard step 3
  + uploading phase, `QuestionCardsPanel` with `GET /api/questions/[id]/cards`,
  `canEditQuestionCards`, SCSS, i18n × 7, unit tests for `cardDrafts` and
  `cardUploadQueue`.
- **Phase 1b (small, recommended right after):** `POST /api/questions/[id]/cards` +
  "+ Add card" in saved mode; `CardPreview`.
- **Later, not designed here:** client-side downscale before upload (the main app
  compresses to ~200 KB; MC accepts 5 MB as-is — fine for admins, revisit if storage cost
  or swipe load time becomes visible); rebuilding `CardImageModal` on `PictureWell`;
  editing card text in saved mode (needs an admin check on `PATCH /api/statements/[id]`
  first).

## 8. Out of scope

- Participant-uploaded pictures and AI moderation of them (separate, later phase).
- Cropping / focal-point tools; the preview shows the crop, the admin picks a better image.
- Image URLs pasted as text (a URL in the card text stays text).
- Reordering cards (the swipe UI randomises or uses adaptive batches; order is not shown to
  participants).
- Changing the swipe card layout itself.

---

## Implementation notes (Phase 1, as built)

Deviations from the spec above, chosen to keep the first version small:

- **No ⋯ menu.** Rows show direct icon buttons instead: 🗑 remove picture (saved mode asks
  "Remove this picture?" inline) and ✕ delete card (wizard, cards mode). No card preview.
- **No "Paste more lines…" textarea.** In cards mode, pasting several lines into a row's
  text field splits them into new cards after it; Enter adds a card; Backspace in an empty
  card removes it.
- **Retry only for connection failures.** A file the server refused (400) would be refused
  again, so it shows the reason without a Retry button.
- **Narrow layout by container query**, not viewport: the survey editor nests the list
  deep enough to be narrow on desktop too.
- **Card order.** `POST /api/questions/create` now offsets each card's `createdAt` by its
  index (+1 ms), because one batch shares one clock tick and the Cards panel sorts by it.
- **Access check renamed**: `src/lib/auth/questionCardsAccess.ts` (`canEditQuestionCards`,
  with `canEditCardImage` delegating to it).
- The wizard resets only when it opens; before, creating a question re-ran the reset and
  would have thrown the admin out of the upload phase.
