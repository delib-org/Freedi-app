# Unify Paragraph Sub-Statement CRUD Across All Apps

> Execution plan. Companion architecture doc: [`../architectures/PARAGRAPH_MODEL_ARCHITECTURE.md`](../architectures/PARAGRAPH_MODEL_ARCHITECTURE.md).

## Context

Paragraphs are the rich body of a Statement. The project's canonical model (per CLAUDE.md "Paragraphs are child Statements") is: **a paragraph = a child `Statement` with `statementType === StatementType.paragraph`**, an `order` number, a `blockType` (`ParagraphType`), and rich metadata. The parent's `description` is a denormalized preview cache kept in sync server-side by `functions/src/fn_syncParagraphChildrenToDescription.ts`.

Today the apps diverge into **three** paragraph models, and the main app runs **two at once**:

| App | Model | C | R | U | D |
|-----|-------|---|---|---|---|
| **Main** (`src/`, Vite/React) | Canonical child-statement (`StatementBody`/`paragraphChildren.ts`) **+ a parallel legacy `paragraphs[]` subsystem** (`paragraphUtils.ts`, `RichTextEditor`, `ParagraphsDisplay`, `EditableDescription`) | ✅ | ✅ | ✅ | ✅ |
| **Join** (`apps/join`, Mithril) | Canonical child-statement; only whole-body re-seed (no per-paragraph update/move/delete) | ✅ | ✅ | ⚠️ | ⚠️ |
| **Sign** (`apps/sign`, Next.js) | **Different**: official paragraph = `statementType === option` + `doc.isOfficialParagraph` + rich `doc` metadata | ✅ | ✅ | ✅ | ✅(hide) |
| **MC** (`apps/mass-consensus`, Next.js) | **Legacy embedded `statement.paragraphs[]`** | ✅ | ✅ | ❌ | ❌ |

**Goals (decisions locked):**
1. **Unify** Main, Sign, MC, Join (Flow out of scope) onto the canonical child-statement model with **one shared CRUD layer**.
2. **Extend** the canonical model so Sign's rich metadata (paragraph type incl. images/tables/lists, image fields, listType, version history) is fully represented — no loss.
3. **Include reversible data migration** of existing Sign (`option`→`paragraph`) and MC (embedded→children) data.
4. **Deprecate the embedded `Statement.paragraphs[]` array** (do NOT rip it out): mark `@deprecated`, stop writing it in new code, keep it in the schema, leave legacy read paths in place. Removal is out of scope.

**Sign hierarchy:** the **document itself is a `statementType === option`** (the parent); its body paragraphs become real `statementType === paragraph` children of that document-option; suggestions remain `statementType === option` children of each paragraph. Tree: **document (option) → paragraph (paragraph) → suggestion (option)**.

Outcome: every app CRUDs paragraphs through one set of utilities against one canonical Firestore shape; `paragraphs[]` stays as a deprecated, no-longer-written field.

---

## Phase 0 — Persist plan & architecture docs (this file + the architecture doc)

Write `plans/unify-paragraph-crud.md` (this file) and `architectures/PARAGRAPH_MODEL_ARCHITECTURE.md`, and link the latter from `architectures/README.md`.

## Phase 1 — Extend canonical model in `@freedi/shared-types`

Files: `packages/shared-types/src/models/statement/StatementUtils.ts`, `.../paragraph/paragraphModel.ts`, `.../statement/StatementTypes.ts`.

- Add factory **`createParagraphChildStatement()`** → `statementType === paragraph` child with `order`, `blockType`, optional `doc` metadata (image/list), caller-supplied `statementId`, `isOfficial` transition flag (writes `doc.isOfficialParagraph`). Conditional-spread `doc` so no `undefined` reaches Firestore. Must pass `safeParse(StatementSchema)`.
- Add mappers **`statementToParagraph()`** / **`paragraphToFactoryParams()`** (`blockType ?? doc.paragraphType`, `order ?? doc.order ?? createdAt`, `doc.listType/imageUrl/...`).
- Make `createParagraphStatement` (Sign) a thin `@deprecated` wrapper; suggestions factory unchanged.
- Keep the `paragraphs` field in the schema; add `@deprecated` JSDoc.

## Phase 2 — Shared injectable CRUD in `@freedi/shared-utils`

New module `packages/shared-utils/src/paragraphs/`. **No `firebase`/`firebase-admin` imports** — injected store adapter.

- `ParagraphStore`: `statementRef(id)`, `getParagraphChildren(hostId)`, `batch()` (500-chunked), `update(id, patch)`, `delete(id)`, `now()`. `ParagraphDeps`: `{ store, creator, logError }`.
- Port logic from `src/controllers/db/statements/paragraphChildren.ts` (same return shapes): `sortParagraphChildren`, `addParagraphChild`, `updateParagraphChild`, `deleteParagraphChild(soft?)`, `moveParagraphChild`, `reorderParagraphChildren`, `replaceAllParagraphChildren`, `getParagraphChildren`, `listenParagraphChildren` (client only).
- Per-app wiring (~30 lines each): Main (client SDK + redux creator), Join (client `db`), Sign (two stores: client + admin), MC (admin store).
- Verify: zero firebase imports; fake-store unit tests; 4-app typecheck.

## Phase 3 — Migrate app code paths (order: Main → Join → MC → Sign)

- **3a Main** — `paragraphChildren.ts` delegates to shared (same signatures; `StatementBody.tsx` untouched).
- **3b Join** — `apps/join/src/lib/store.ts`: `updateSuggestion`/`sendMessage` → shared `replaceAllParagraphChildren`; `loadOptionParagraphs` ordering → shared `sortParagraphChildren`.
- **3c MC** — creation → shared CRUD (stop writing `paragraphs[]`); `getParagraphsForStatement(stmt)` resolver (children, fallback embedded); route all readers; expose update/delete.
- **3d Sign** — document stays `option`; paragraphs `option`→`paragraph`; suggestions stay `option`. Update `setParagraphStatement.ts`, `finalizeSuggestion.ts` (query suggestions as `option`, guard official as `paragraph`), `lib/firebase/queries.ts` (dual-read), API routes, version-control, google-docs import, editor. Write top-level `order`/`blockType` + mirror `doc.*` during transition.

## Phase 4 — Indexes

`firestore.indexes.json`: add `statements: parentId ASC, statementType ASC, order ASC` (and `topParentId, statementType, order` if used). Keep `parentId + statementType + createdAt` and `parentId + consensus`. Deploy indexes before querying code.

## Phase 5 — Reversible data migration

Admin scripts under `functions/src/`, idempotent, 500-batched, `--dry-run`/`--revert`/`--limit`/`--documentId`.
- **Sign**: `option + doc.isOfficialParagraph` → `statementType=paragraph`, `order=doc.order`, `blockType=doc.paragraphType`, keep `doc` image/list, **preserve `statementId`**, stamp `doc._migratedFrom='option'` + snapshot for revert. Suggestions untouched.
- **MC**: embedded `paragraphs[]` → paragraph children (preserve `paragraphId` as `statementId`), stamp `doc._migratedFrom='embedded'`. Leave embedded array in place (deprecated). Revert = delete created children.
- Sequence: deploy dual-read → dry-run → staged → verify → full.

## Phase 6 — Deprecate `paragraphs[]` (no removal)

- Keep field + schema entry + `createStatementObject`/`createBasicStatement` param; add `@deprecated` JSDoc.
- Stop writing it in unified create paths (shared factory, MC creation, Sign import/editor, Main `createStatement.ts`).
- Leave legacy readers in place (main app embedded subsystem kept as-is). No grep-zero guard, no schema removal.

---

## Risks & key invariants
- **Sign suggestion/approval linkage**: official→`paragraph` while suggestions stay `option` is the linchpin; dual-read + explicit type filters.
- **`finalizeSuggestion`** must query suggestions as `option` (not the official's type).
- **Stable IDs**: factory + migration preserve `statementId`.
- **Sync trigger now fires for Sign**: it will own `document.description`; verify Sign doesn't depend on a manual description.
- **Missing composite indexes** → runtime failures; deploy indexes first.
- **Order divergence mid-migration**: shared sorter falls back `order ?? doc.order ?? createdAt`.
- **Valibot**: never write `undefined` into `doc`.
- **`paragraphs[]` only deprecated**: legacy readers stay; avoids the ~400-reference sweep.

## Verification
- Per phase: P1 schema round-trip + factory parity; P2 fake-store unit tests + `grep -L firebase` + 4-app typecheck; P3a/b/c smoke tests with no migration (dual-read proves both shapes render); P3d Sign editor + create/edit/reorder/delete + suggestion + finalize + approvals/comments + import + updated integration tests.
- Migration: dry-run counts; staged run + `--revert` round-trip.
- End-to-end per app (Playwright MCP / `npm run dev`): multi-paragraph body create/edit/reorder/delete; `description` preview updates across Main, Sign, MC, Join.
- Final: `npm run check-all`, `cd apps/sign && npm run build`, MC + Join builds; confirm create paths no longer write `paragraphs[]`.
