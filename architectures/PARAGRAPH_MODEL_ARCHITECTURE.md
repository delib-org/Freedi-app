# Paragraph Model Architecture

> Target architecture for paragraph (rich-body) content across all Freedi apps.
> Execution plan: [`../plans/unify-paragraph-crud.md`](../plans/unify-paragraph-crud.md).

## Overview

A Statement's rich body is **not** an embedded array. It is a set of **child Statements**, each of `statementType === paragraph`, ordered by an `order` field. This is the canonical model referenced in `CLAUDE.md` ("Paragraphs are child Statements"). All apps (Main, Sign, MC, Join) read and write paragraphs through **one shared CRUD layer** in `@freedi/shared-utils`, backed by one Firestore shape.

The legacy embedded `Statement.paragraphs[]` array is **deprecated** (kept for backward compatibility, no longer written by new code).

## Canonical data shape

A paragraph child Statement:

| Field | Meaning |
|-------|---------|
| `statementType` | `StatementType.paragraph` |
| `parentId` | host statement (the body owner) |
| `topParentId` | document / root |
| `order: number` | canonical ordering (replaces Sign's `doc.order`) |
| `blockType: ParagraphType` | visual type — `h1`–`h6`, `paragraph`, `li`, `table`, `image` (replaces Sign's `doc.paragraphType`) |
| `doc` | rich metadata bag: `listType`, `imageUrl`, `imageAlt`, `imageCaption`, version-control settings |
| `statementId` | stable id — comments/approvals/evaluations key on it; migration must preserve it |

**Preview cache:** the parent's `description` is denormalized from its paragraph children by the Firestore trigger `functions/src/fn_syncParagraphChildrenToDescription.ts` (joins child text, truncates at 5000 chars). Cards, hubs, and SEO read `description`; full body reads the children.

## Statement hierarchy

```
document / host statement
  ├── paragraph (statementType === paragraph)   ← rich body, ordered
  │     └── suggestion (statementType === option)   ← Sign: alt-text proposals
  │     └── comment    (statementType === statement) ← Sign: discussion
  └── paragraph ...
```

**Sign clarification:** in Sign the **document itself is a `statementType === option`** (the parent). Its body paragraphs are `statementType === paragraph` children of that document-option. Suggestions remain `statementType === option` children of each paragraph. So "official paragraph" is distinguished purely by being `paragraph` type — the legacy `doc.isOfficialParagraph` flag becomes redundant (kept one release for dual-read, then no longer written).

## Shared CRUD layer

`packages/shared-utils/src/paragraphs/` — **SDK-agnostic** (no `firebase`/`firebase-admin` imports). Behavior is injected via a store adapter so client-SDK apps and admin-SDK/Next.js apps share one implementation.

```
ParagraphStore {
  statementRef(id)
  getParagraphChildren(hostId)   // parentId==host & statementType==paragraph & !hide
  batch()                        // set/update/delete/commit, 500-chunked
  update(id, patch)
  delete(id)
  now()
}
ParagraphDeps { store, creator: () => User|undefined, logError }
```

Functions (ported from the main app's `src/controllers/db/statements/paragraphChildren.ts`, the most complete impl): `sortParagraphChildren`, `addParagraphChild`, `updateParagraphChild`, `deleteParagraphChild(soft?)`, `moveParagraphChild`, `reorderParagraphChildren`, `replaceAllParagraphChildren`, `getParagraphChildren`, `listenParagraphChildren` (client only).

### Per-app wiring

| App | SDK | Store wiring | Delete |
|-----|-----|--------------|--------|
| Main (React) | client | `FireStore` + `createStatementRef` + redux creator | hard |
| Join (Mithril) | client | client `db` + session creator | hard |
| Sign (Next.js) | client **and** admin | client store (editor/optimistic) + admin store (API routes, finalize, migration) | soft (`hide: true`) |
| MC (Next.js) | admin | admin store for server actions | soft/hard |

## Factory & mappers (`@freedi/shared-types`)

- `createParagraphChildStatement()` — single factory producing a `paragraph` child (used by every app, replaces Main's inline `createStatementObject + {blockType, order}` and Sign's `createParagraphStatement`).
- `statementToParagraph()` / `paragraphToFactoryParams()` — canonical mappers between the `Paragraph` DTO and paragraph child Statements; tolerate legacy fields (`order ?? doc.order ?? createdAt`, `blockType ?? doc.paragraphType`).
- `createParagraphStatement` (Sign) is retained as a thin `@deprecated` wrapper.

## Deprecated: `Statement.paragraphs[]`

The embedded array (`StatementTypes.ts` `paragraphs: optional(array(ParagraphSchema))`) is kept in the schema with a `@deprecated` note. Unified create paths no longer write it. Legacy readers (the main app's `paragraphUtils.ts` / `RichTextEditor` / `ParagraphsDisplay` / `EditableDescription` subsystem, MC's resolver fallback) continue to read it for backward compatibility until separately migrated. Migration scripts backfill children from this array but do not delete it.

## Migration

Reversible admin scripts under `functions/src/` (idempotent, batched, `--dry-run`/`--revert`/`--limit`/`--documentId`):
- **Sign**: `option + doc.isOfficialParagraph` → `statementType=paragraph` (`order`/`blockType` from `doc.*`, `doc` metadata kept, `statementId` preserved). Suggestions untouched.
- **MC**: embedded `paragraphs[]` → paragraph children (`paragraphId` → `statementId`). Embedded array left in place.

## Key invariants
- Stable `statementId` preserved everywhere (linkage for comments/approvals/evaluations).
- Suggestions are always `statementType === option`; `finalizeSuggestion` queries them as `option`, never by the official paragraph's type.
- The `description` sync trigger keys only on `statementType === paragraph`; after Sign migration it owns Sign documents' `description`.
- Never write `undefined` into `doc` (valibot/Firestore reject it) — conditional spread.
