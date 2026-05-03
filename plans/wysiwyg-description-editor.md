# WYSIWYG Description Editor — Persistence to Canonical Paragraph Storage

## What's actually broken (verified)

The repo has **two parallel paragraph models that nothing reconciles**:

### Model A — Legacy embedded array `Statement.paragraphs[]`
- Defined in `packages/shared-types/src/models/statement/StatementTypes.ts:62` as `optional(array(ParagraphSchema))`.
- Each `Paragraph` has its own `paragraphId` (string like `p_xxxxxxxx`) generated client-side, plus `type`, `content`, `order`, optional `listType`.
- Written by:
  - `src/view/pages/statement/components/settings/components/titleAndDescription/TitleAndDescription.tsx:55-77` (the textarea — `\n` becomes paragraph; the user's complaint).
  - `src/controllers/db/statements/updateStatementFields.ts:184-207` (`updateStatementParagraphs`) — `updateDoc(statementRef, { paragraphs })`. Used by `DocumentEditModal`.
  - `src/controllers/db/statements/setStatements.ts` re-exports it; the settings form's submit path calls `updateStatement(...).paragraphs` which is then persisted by `setStatementToDB` via `setDoc({ ...statement }, { merge: true })` at `src/controllers/db/statements/writeStatement.ts:121`.
  - 11 other call sites that build `Paragraph[]` and merge it into a Statement (chat input, suggestion chat, AddStage, EnhancedStatementSettingsForm, vote info, createStatementModal, GetInitialStatementData, EditableStatement, etc.).
- Read by:
  - `ParagraphsDisplay` (`src/view/components/richTextEditor/ParagraphsDisplay.tsx`) — the only "rich" display in the main app.
  - `EditableDescription` (both copies, evaluation page + MultiStageQuestion).
  - `TreeOptionNode` / `TreeMessageNode` — they fall back to `statement.description` when `paragraphs` is empty.
  - Settings textarea itself for `defaultValue`.

### Model B — Child Statements with `statementType === StatementType.paragraph`
- Created via `addParagraphChild` in `src/controllers/db/statements/paragraphChildren.ts:37-102`. Uses `createStatementObject(...)` from `@freedi/shared-types` and stores `blockType` (visual type) + `order` (integer with sibling-shift on insert).
- Mutated by `updateParagraphChild` / `deleteParagraphChild` / `moveParagraphChild` in the same file.
- Subscribed by exactly **one** view: `src/view/components/atomic/molecules/StatementBody/StatementBody.tsx` at lines 65-77 (its own per-host `onSnapshot`, not Redux).
- Excluded from the tree-view selector (`src/redux/statements/treeViewSelectors.ts:22`) so they don't pollute the questions/options tree.
- The functions trigger `updateParentOnChildChange` in `functions/src/fn_statement_updates.ts:202-216` regenerates `Statement.description` from `StatementType.paragraph` children — so the canonical "preview" mechanism is tied to Model B, not Model A.

### Model C — Sign-app "official paragraphs"
- Different again: `statementType === option`, with `doc.isOfficialParagraph: true`, `doc.order`, `doc.paragraphType`. Created by `createParagraphStatement` in `packages/shared-types/.../StatementUtils.ts:217-254`.
- The trigger `functions/src/fn_syncParagraphsToDescription.ts:34-131` aggregates these into `Statement.statement` (not `description`).
- **Not relevant to the main-app settings page.** Only confused as part of the audit; do not touch it.

### The reconciliation gap
There is **no Cloud Function** that watches writes to `Statement.paragraphs[]` and creates/updates child paragraph Statements from it. I grepped `functions/src/` for any such trigger. The only related sync trigger (`fn_syncParagraphsToDescription`) goes the *other* way (children → host) and only fires for `doc.isOfficialParagraph` (Sign-app Model C), not main-app Model B.

So the user's premise is correct: the existing `RichTextEditor` + `DocumentEditModal` write to the wrong place. They update Model A. The canonical preview-regeneration trigger reads from Model B. Result: editing the description in the rich editor (or the textarea) does **not** update what other listeners see as the description preview, does **not** create discoverable paragraph children, and silently diverges from any document where `StatementBody` is also used.

### What does NOT depend on `Paragraph.paragraphId` externally
I grepped for cross-collection references (comments, evaluations, votes, subscriptions) keyed on the legacy `paragraphId`. There are none in the main app or `functions/src/`. The Sign-app migration script at `apps/sign/src/scripts/migrateAllDocumentsToParagraphStatements.ts:191-206` builds an `oldParagraphId → newStatementId` mapping precisely because that referencing exists in the Sign app's parallel collections — but those references all live under the Sign-app surface area, not the main app.

This means: in the **main app**, the legacy `Paragraph.paragraphId` is purely a render key. We can safely abandon it for new writes. Identity-preservation pressure for diff-and-patch comes from `StatementBody` viewing the same host concurrently and `description` regeneration churn — not from cross-document FKs.

---

## Recommended architecture

### Single source of truth: child paragraph Statements (Model B)

The WYSIWYG must operate on Model B. Model A becomes read-only legacy and is migrated lazily on first save.

```
┌──────────────────────────────────────────────────────────┐
│  Settings form (TitleAndDescription)                     │
│  ──────────────────────────────────                      │
│  Title input ─────────────────► statement.statement      │
│                                                          │
│  Inline WYSIWYG ─► editor JSON ─► EditorBlock[] ─►       │
│                                   reconcileParagraphChildren()│
│                                                          │
│  Save button (form submit) ────► one batch:              │
│                                   • host doc title       │
│                                   • paragraph child      │
│                                     creates/updates/     │
│                                     deletes/reorders     │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
            Firestore writeBatch (atomic ≤500 ops)
                           │
                           ▼
       fn_updateParentOnChildChange regenerates
       Statement.description from paragraph children
                           │
                           ▼
           ParagraphsDisplay / TreeNode / cards
           that read Statement.description update
```

### Decision 1 — Persistence: diff-and-patch (chosen) over full-replace

**Recommendation: diff-and-patch.** Match editor blocks to existing paragraph child Statements by `statementId` (round-tripped through the editor as a `data-statement-id` attribute on each block node), then:
- Block exists in editor + DB with same content+blockType → no-op.
- Block exists in both, content or blockType changed → `update`.
- Block in editor with no `statementId` (newly typed) → `set` with new `statementId`.
- Block in DB but missing from editor → `delete`.
- Order in editor differs from DB → `update` only the `order` field of affected blocks (renumber compactly).

All ops accumulate in a single `writeBatch`, committed atomically. If batch >500, split (use `executeBatchUpdates` from `firebaseUtils`).

**Why not full-replace (delete-all + recreate)?**
1. Concurrency: a second admin opening `StatementBody` while the first saves would briefly see the document empty. With diff-and-patch, only changed blocks flicker.
2. Trigger churn: `fn_updateParentOnChildChange` fires once per child write. Full-replace of an N-block document = N deletes + N creates = 2N trigger invocations + 2N description regeneration queries. Diff-and-patch on a typo-fix = 1 invocation.
3. Cost: same write-count for a totally-new document; far cheaper for the common case (admin tweaks one paragraph).
4. Correctness: `addParagraphChild` already implements sibling-renumbering for inserts. Full-replace would reset every `order`, making it impossible to detect "this is just an edit" from snapshot diffs (matters for collaborators on the same host).

**Why not the Sign-app pattern (write to embedded array, sync down via a new Cloud Function)?**
Adding a `paragraphs[]`-watching trigger creates a second source of truth and a write fan-out where every save triggers N child writes server-side. The whole point of Model B is that child Statements *are* the canonical store. Adding a sync trigger just paves over the architectural split rather than collapsing it.

### Decision 2 — Identity preservation via TipTap node attribute

Round-trip the child `statementId` through the editor by extending TipTap's `paragraph`, `heading`, and `listItem` nodes with an attribute `data-statement-id`. The default `StarterKit` nodes accept custom `addAttributes` via TipTap's `Node.extend({ addAttributes })`. New blocks the user creates by hitting Enter have no attribute (the diff considers them new). Existing blocks loaded from DB carry their `statementId` and survive content edits.

Diff key precedence:
1. `data-statement-id` on the node → exact match, this is an existing block.
2. No id but content+position match a known block → treat as renumber, not delete+create. (Defensive: covers cases where TipTap rebuilds a node.)
3. No match → new block.

### Decision 3 — Component structure: inline editor in the settings form (no modal)

The settings form has one Save button governing title + description + many other settings. Putting the description in a modal (with its own Save) inside that form creates two save semantics: "Save in modal" persists immediately while "Save in form" persists everything else. That's already the bug shape that broke the existing `DocumentEditModal` path — saves bypass the form lifecycle.

**Inline approach:** Replace the `<textarea>` with a `<RichTextEditorInline>` component. The editor:
- Maintains internal TipTap state.
- On every change, calls a parent callback `onEditorStateChange(editorJSON)` — parent stashes the latest JSON in a ref.
- Does **not** save to Firestore directly.
- Form `handleSubmit` calls `commitParagraphChildren(host, latestEditorJSON, currentChildren)` which runs the diff-and-patch in one batch.
- Title write and paragraph batch are committed in the **same** `WriteBatch` so the host title and body cannot diverge on partial failure.

This means we deprecate `DocumentEditModal` for the settings page. We keep it for now for the other callers (see Decision 5), but mark it for migration.

### Decision 4 — Migration: lazy on first save, with a read-time fallback

Three states a host statement can be in when an admin opens settings:

| State | `statement.paragraphs[]` | Child paragraph Statements | Display |
|---|---|---|---|
| Pristine new | empty/undefined | none | empty editor |
| Legacy only | populated | none | seed editor from legacy array |
| Canonical | empty | populated | seed editor from children |
| Both | populated | populated | seed from children, ignore legacy |

**Read-time precedence:** The editor's initial content is built from a function `getEditorSeedBlocks(host, paragraphChildren)`:
- If `paragraphChildren.length > 0`, use them. Children win.
- Else if `host.paragraphs?.length > 0`, convert legacy paragraphs to editor blocks **without** `statementId` (so the diff treats them as new on first save).
- Else, empty.

**Write-time migration:** When the user clicks Save:
- The diff produces N "create" operations for the legacy-converted blocks (each gets a fresh `statementId` via `createStatementObject`).
- The same batch also clears `host.paragraphs` to `[]` to prevent the legacy data from re-seeding next time.

This is the cleanest migration: no scheduled job, no admin button, no Cloud Function. The first edit migrates one host. Hosts that are never edited still display correctly (legacy fallback in seed). The existing migration script at `apps/sign/src/scripts/migrateAllDocumentsToParagraphStatements.ts` is **Sign-app specific** (it migrates to Model C with `doc.isOfficialParagraph`) and should not be invoked for main-app documents — leave it alone.

The migration script is not admin-runnable from the UI; it's a Node CLI script. Even if we wanted server-side migration, the Sign-app script targets the wrong model. Lazy migration is the right call for the main app.

### Decision 5 — Scope: fix the settings page now, refactor the other callers in a follow-up

The same wrong write path is used by:
- `src/view/components/edit/EditableDescription.tsx` (used in `MultiStageQuestion/sections/EmptyStateSection.tsx` and `IntroductionSection.tsx`).
- `src/view/pages/statement/components/evaluations/components/description/EditableDescription.tsx` (used in `StatementsEvaluationPage`).

Both wrap `DocumentEditModal`, which calls `updateStatementParagraphs` → writes Model A. Same architectural bug.

**Recommendation:** fix the settings page in PR 1 (this plan), then do PR 2 that:
- Replaces the inline modal with the same `RichTextEditorInline` (in a small wrapper modal so the existing UX doesn't change for users), or
- Migrates those call sites to inline rendering.

Reasons not to bundle:
- Settings has the textarea (acutely "horrible UX") — that's the critical path.
- The other two sites already have a working WYSIWYG (just wrong storage). They display correctly via `ParagraphsDisplay` reading the legacy array. They're not on fire.
- The migration helper functions (`reconcileParagraphChildren`, `editorJsonToBlocks`, `blocksToEditorJson`) we build in PR 1 will be reusable in PR 2.
- Smaller PR = faster review and lower regression surface for a foundational rewrite.

### Decision 6 — Concurrency: optimistic, last-write-wins per block

A second admin saving simultaneously is rare in practice but worth bounding:
- Each block-update `batch.update` operates on a single `statementId` doc. Last write wins per block. No silent total overwrite.
- We do **not** add `lastUpdate` precondition guards — they'd force users into refresh-rebase loops the UI doesn't support.
- The host title write also has no precondition. Settings save is a deliberate admin action; OCC would frustrate.
- Document this limitation in a code comment near `reconcileParagraphChildren`.

The editor's `useEffect` already auto-rebases on prop change in `RichTextEditor.tsx:269-280`, but only if not currently editing. We extend that pattern: if the host's child-paragraph snapshot updates while the inline editor has unsaved changes, show a small "external changes detected — your changes will overwrite" banner. Defer the banner to PR 2 if it slows down PR 1.

---

## File-by-file implementation outline

### New files

**`src/controllers/db/statements/reconcileParagraphChildren.ts`**
- `interface EditorBlock { statementId?: string; blockType: ParagraphType; content: string; order: number }`
- `function diffParagraphs(editorBlocks: EditorBlock[], existingChildren: Statement[]): { creates, updates, deletes, reorders }`
- `async function reconcileParagraphChildren(host: Statement, editorBlocks: EditorBlock[], existingChildren: Statement[]): Promise<void>` — builds `WriteBatch`, splits at 500 if needed, commits.
- Optionally accepts `extraBatchOps?: (batch: WriteBatch) => void` so the settings form can fold its title write + `paragraphs: []` clear into the same batch.
- `__tests__/reconcileParagraphChildren.test.ts` — diff function is pure and easily unit-tested. Cover: identical, content-only edit, blockType-only edit, insert middle, insert end, delete middle, full reorder, empty-to-N, N-to-empty.

**`src/view/components/richTextEditor/RichTextEditorInline.tsx`**
- TipTap editor as a controlled-ish component. Props: `initialBlocks: EditorBlock[]`, `onBlocksChange: (blocks: EditorBlock[]) => void`, `placeholder`, `className`.
- Extends StarterKit's `paragraph`, `heading`, `listItem` with a `statementId` attribute via `Node.extend({ addAttributes })`. Round-trips through `data-statement-id` on output and `getAttrs` on parse.
- Exposes a small toolbar (reuse `EditorToolbar.tsx`).
- No save/cancel buttons (the parent form owns those).
- Internal `editorToBlocks` and `blocksToEditor` helpers (extracted/copied from existing `RichTextEditor.tsx` but updated to read/write `statementId`).
- `RichTextEditorInline.module.scss` — small file, mostly delegates to existing `RichTextEditor.module.scss` patterns; new BEM block `.rich-text-editor-inline`.

**`src/utils/editorBlockUtils.ts`**
- `getEditorSeedBlocks(host: Statement, children: Statement[]): EditorBlock[]` — implements the read-time precedence from Decision 4.
- `legacyParagraphToBlock(p: Paragraph): EditorBlock` — pure helper.
- `paragraphChildToBlock(s: Statement): EditorBlock` — pure helper.
- `__tests__/editorBlockUtils.test.ts`.

### Modified files

**`src/view/pages/statement/components/settings/components/titleAndDescription/TitleAndDescription.tsx`**
- Remove the `<textarea>` and its `onChange` (lines 55-77).
- Remove `getParagraphsText`, `generateParagraphId`, `ParagraphType` imports.
- Add `useEffect` subscribing to paragraph children of `statement` (same query as `StatementBody.tsx:65-77`). Store in local state.
- Render `<RichTextEditorInline initialBlocks={getEditorSeedBlocks(statement, children)} onBlocksChange={editorBlocksRef.current = blocks} />`.
- Expose the latest blocks ref via a callback prop to the parent form, OR via a new helper passed through `setStatementToEdit` (preserve existing API contract). Cleanest: extend `StatementSettingsProps` with `setEditorBlocks(blocks: EditorBlock[]): void` and stash on the parent.
- Move the `Import from Google Docs` button into the editor toolbar (separate concern, but it lives next to the description; keep it adjacent).

**`src/view/pages/statement/components/settings/components/statementSettingsForm/StatementSettingsForm.tsx`**
- In `handleSubmit` (line 90), after the existing `setNewStatement` call, call `reconcileParagraphChildren(statement, latestEditorBlocks, currentChildren)`.
- Better: refactor `setNewStatement` to optionally return the in-flight batch and let the form commit it as one transaction. Or, pragmatically: do title save first, then child reconciliation as a second batch. Two-batch sequencing is acceptable here because the trigger only fires on child writes and the host doc has no preconditions. Document this in a comment.
- Hold a `useRef<EditorBlock[]>([])` to receive blocks from `TitleAndDescription`.

**`src/view/pages/statement/components/settings/settingsTypeHelpers.ts` (or wherever `StatementSettingsProps` lives)**
- Add the optional `setEditorBlocks?: (blocks: EditorBlock[]) => void` to `StatementSettingsProps`.

**`src/view/pages/statement/components/settings/components/statementSettingsForm/EnhancedStatementSettingsForm.tsx`**
- Same treatment as `StatementSettingsForm.tsx` (lines 117 and 162 use the legacy paragraphs path). This file is a near-duplicate of `StatementSettingsForm.tsx`; same edit applies.

**`src/controllers/db/statements/updateStatementFields.ts`**
- Mark `updateStatementParagraphs` as `@deprecated` with a JSDoc pointing to `reconcileParagraphChildren`. Do not delete yet — `DocumentEditModal` still uses it, and PR 2 will retire it.
- Modify `updateStatement` (line 99) to NOT propagate `paragraphs` field on subsequent settings saves once the host has been migrated. Specifically: if the caller passes `paragraphs: []` (the post-migration state), preserve that and don't merge in legacy. The current `if (paragraphs) newStatement.paragraphs = paragraphs;` is fine — empty array still triggers the assignment. The settings save path will pass `[]` after migration and that will overwrite the legacy data. Confirm with test.

### Files to leave alone (for PR 1)

- `src/view/components/richTextEditor/RichTextEditor.tsx` — keep until PR 2 retires it.
- `src/view/components/richTextEditor/DocumentEditModal.tsx` — keep until PR 2.
- `src/view/components/edit/EditableDescription.tsx` — keep until PR 2.
- `src/view/pages/statement/components/evaluations/components/description/EditableDescription.tsx` — keep until PR 2.
- `apps/sign/...` — completely out of scope. Different model (Model C).
- `functions/src/fn_statement_updates.ts` — already correctly regenerates `description` from Model B children. No changes needed.

### Files to delete (for PR 1)

None. Deletions defer to PR 2 once `EditableDescription` callers are migrated.

---

## Risks and what to test

### Risks
1. **Trigger thunder.** A 50-block document fully reordered = 50 `update` writes = 50 invocations of `fn_updateParentOnChildChange`, each running a `where('parentId', '==', host.statementId)` query and a parent doc update. This is already the case today for `StatementBody` reorders. Mitigation deferred — if it becomes a hot spot, add a debounce in the trigger.
2. **`StatementBody` and the settings editor disagreeing.** `StatementBody` subscribes to children directly; the settings inline editor seeds from the same query. If the settings save commits while `StatementBody` is open in another tab, that tab will receive the snapshot updates and re-render mid-edit. Last-write-wins per block (Decision 6) bounds this to per-block clobber, not whole-document loss.
3. **Legacy fallback never clears for view-only hosts.** A host that's read but never edited keeps its `paragraphs[]` legacy array forever. That's fine: read-time precedence handles it. No correctness issue. Eventual cleanup is a separate Cloud-Function migration if we want to ship a "kill the legacy field" follow-up — out of scope here.
4. **`createStatementObject` defaults `paragraphs: []`.** When we create paragraph children (which are themselves Statements), they get an empty `paragraphs[]` field of their own. Harmless — they're leaves of the body tree, no one edits them as documents. But it bloats every paragraph child by a few bytes. Worth noting; not worth fixing in this PR.
5. **`description` regeneration race on first save.** The trigger runs *after* each child write. The settings form's `navigate(...)` fires immediately on save; the destination page may render before `description` is regenerated. Result: stale preview for ~1 second. Same race exists today for `StatementBody`. Acceptable.
6. **Two settings forms.** `StatementSettingsForm.tsx` and `EnhancedStatementSettingsForm.tsx` are near-duplicates. Forgetting to update one will leave a regression. Add a code comment + grep gate in the test plan.

### Test plan

**Unit (Jest)**
- `diffParagraphs`: 8+ scenarios as listed above.
- `getEditorSeedBlocks`: pristine, legacy-only, canonical-only, both-present (children win), missing-statement field.
- TipTap node-extension round-trip: serialize `EditorBlock[]` with statementIds → editor JSON → parse back → IDs preserved.

**Integration (Playwright, against emulators)**
- Open a brand-new statement settings page → type 3 paragraphs → save → reload → 3 paragraph children exist in Firestore, `host.paragraphs` is `[]`, `host.description` reflects the body.
- Open a legacy-only statement (seed via test fixture: paragraphs in array, no children) → settings opens with editor pre-populated → edit one paragraph → save → 3 children created with NEW ids, legacy array cleared.
- Open a canonical statement → settings opens with editor pre-populated from children → reorder paragraphs → save → only `order` field changes on existing children, no creates/deletes.
- Concurrent: open the same statement in two tabs (settings + main view with `StatementBody`) → edit in settings → save → second tab updates without flicker beyond the changed block.
- Title-only edit: open settings → change title only → save → no child writes occur (verified via Firestore emulator log or by spying on `writeBatch`).

**Manual smoke**
- Verify `EnhancedStatementSettingsForm` (the duplicated form) is also fixed.
- Verify the existing `EditableDescription` (evaluation page, MultiStageQuestion) still works as before — they're untouched in PR 1.

---

## Premises I couldn't verify (or found wrong)

1. **User's claim: "the existing WYSIWYG also persists to the legacy field."** **Verified true.** `DocumentEditModal.handleSave` → `updateStatementParagraphs` → `updateDoc(ref, { paragraphs })`. No reconciliation to children.

2. **User's claim: "Statement.description is auto-generated by `generateDescriptionFromChildren`."** **Verified true** at `functions/src/fn_statement_updates.ts:202-225`, but with a nuance: the trigger generates description from *paragraph children* if any exist, otherwise from *the most recent children of any type* (line 215-217). So a host with only options/questions also gets a description — just from option titles, not paragraph content. Doesn't change the design but worth noting: a host that never had paragraph children will lose its option-derived description on first paragraph save (which is correct behavior, but operators may notice).

3. **User's reference to `apps/sign/src/scripts/migrateAllDocumentsToParagraphStatements.ts` as relevant.** **Found wrong / misleading for the main app.** That script migrates to Model C (Sign-app `doc.isOfficialParagraph` with `statementType === option`), not Model B (`statementType === paragraph`). It was written for the Sign-app document workflow. Running it on main-app documents would create a third copy of the data in the wrong model. Lazy migration is the right path; the script is not reusable here.

4. **Premise: paragraph child Statements may be referenced elsewhere by `statementId`.** **Mostly false in the main app.** I grepped subscriptions, votes, evaluations, comments — none key off paragraph-child IDs in the main-app surface. The Sign-app has cross-references on `paragraphId` (which is *its* child statement id), but those don't reach into main-app collections. Identity preservation is therefore needed only for: (a) avoiding `StatementBody` flicker on concurrent edits, (b) avoiding trigger fan-out. Both are good reasons but not the originally-implied "external FKs would break."

5. **Premise: `Paragraph.paragraphId` (legacy embedded) is referenced anywhere outside the editor.** **Verified false in main app.** Only used as React `key` in `TreeOptionNode`/`TreeMessageNode` and in `RichTextEditor`'s "preserve IDs by index" merge. Safe to abandon for new writes.

6. **Premise: there's "a sync trigger that reconciles `paragraphs[]` into child Statements".** **Verified false.** No such trigger exists. The only sync trigger (`fn_syncParagraphsToDescription`) is for the Sign-app's Model C and runs in the opposite direction (children → host text).

7. **Premise: settings form has a single Save button governing title + description.** **Verified true** at `StatementSettingsForm.tsx:122-157`. The Save button at line 149 is a form submit; `handleSubmit` runs `setNewStatement` which persists title and (currently) the legacy paragraphs array in one go. Inline-WYSIWYG approach is the right fit.

8. **Existence of `paragraphChildren.ts` controllers.** **Verified true** at `src/controllers/db/statements/paragraphChildren.ts`. Already implements `addParagraphChild`, `updateParagraphChild`, `deleteParagraphChild`, `moveParagraphChild` with sibling-shift on insert. **The reconciliation function should reuse `createStatementObject` exactly as `addParagraphChild` does** (line 73), to stay consistent with the rest of the codebase per `feedback_use_createStatementObject.md`. Do not hand-roll Statement objects in the reconciler.
