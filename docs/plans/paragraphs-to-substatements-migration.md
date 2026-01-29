# Migration Plan: Paragraphs Array to Sub-Statements

> **Status**: Implemented
> **Scope**: All apps (Main, Sign, Mass Consensus)
> **Created**: 2026-01-29

## Overview

Migrate from embedded `paragraphs[]` array to separate Statement documents (sub-statements) with `doc.isOfficialParagraph: true`.

---

## Data Structure Mapping

### OLD: Embedded Array
```typescript
Statement {
  statementId: "doc_123",
  statement: "Document Title",
  paragraphs: [
    { paragraphId: "p1", content: "First paragraph", order: 0, type: "paragraph" },
    { paragraphId: "p2", content: "Second paragraph", order: 1, type: "paragraph" }
  ]
}
```

### NEW: Sub-Statement Documents
```typescript
// Parent document (unchanged)
Statement { statementId: "doc_123", statement: "Document Title" }

// Official Paragraph 1 (NEW document)
Statement {
  statementId: "p1",           // From paragraphId
  statement: "First paragraph", // From content
  parentId: "doc_123",          // Document ID
  topParentId: "doc_123",
  statementType: "paragraph",   // NEW type
  consensus: 1.0,
  doc: {
    isDoc: true,
    order: 0,
    isOfficialParagraph: true,
    paragraphType: "paragraph"
  }
}

// Official Paragraph 2 (NEW document)
Statement {
  statementId: "p2",
  statement: "Second paragraph",
  parentId: "doc_123",
  topParentId: "doc_123",
  statementType: "paragraph",
  consensus: 1.0,
  doc: {
    isDoc: true,
    order: 1,
    isOfficialParagraph: true,
    paragraphType: "paragraph"
  }
}
```

---

## Implementation Status

### Completed

1. **Added `paragraph` to StatementType enum**
   - `packages/shared-types/src/models/TypeEnums.ts`
   - `functions/local-packages/shared-types/src/models/TypeEnums.ts`

2. **Created CLI migration script**
   - `scripts/migrateParagraphsToSubStatements.ts`

### Script Usage

```bash
npx tsx scripts/migrateParagraphsToSubStatements.ts [options]

Options:
  --dry-run              Preview without writing
  --batch-size=<n>       Documents per batch (default: 500)
  --resume-from=<docId>  Resume from specific document
  --document-type=<type> Filter: all | document | question | option (default: all)
```

### Environment Setup

```bash
# Test environment
GOOGLE_APPLICATION_CREDENTIALS=./env/test-service-account.json \
  npx tsx scripts/migrateParagraphsToSubStatements.ts --dry-run

# Production
GOOGLE_APPLICATION_CREDENTIALS=./env/prod-service-account.json \
  npx tsx scripts/migrateParagraphsToSubStatements.ts
```

---

## Field Mapping Reference

| Old (paragraphs[]) | New (Sub-Statement) |
|-------------------|---------------------|
| `paragraphId` | `statementId` |
| `content` | `statement` |
| `order` | `doc.order` |
| `type` | `doc.paragraphType` |
| `listType` | `doc.listType` |
| `imageUrl` | `doc.imageUrl` |
| `imageAlt` | `doc.imageAlt` |
| `imageCaption` | `doc.imageCaption` |
| — | `parentId` = document ID |
| — | `topParentId` = document ID |
| — | `statementType` = "paragraph" |
| — | `doc.isOfficialParagraph` = true |
| — | `consensus` = 1.0 |

---

## Execution Plan

### 1. Test Environment
```bash
# Dry run first
GOOGLE_APPLICATION_CREDENTIALS=./env/test-service-account.json \
  npx tsx scripts/migrateParagraphsToSubStatements.ts --dry-run

# Execute
GOOGLE_APPLICATION_CREDENTIALS=./env/test-service-account.json \
  npx tsx scripts/migrateParagraphsToSubStatements.ts
```

### 2. Verify Test Data
- Check Firestore console for new sub-statement documents
- Verify `doc.isOfficialParagraph: true` on migrated paragraphs
- Verify `parentId` points to correct document
- Test Sign app displays paragraphs correctly

### 3. Production
```bash
# Backup first!
GOOGLE_APPLICATION_CREDENTIALS=./env/prod-service-account.json \
  npx tsx scripts/migrateParagraphsToSubStatements.ts --dry-run

# Execute
GOOGLE_APPLICATION_CREDENTIALS=./env/prod-service-account.json \
  npx tsx scripts/migrateParagraphsToSubStatements.ts
```

---

## Verification Checklist

- [ ] Sub-statements created with correct `statementId` (from paragraphId)
- [ ] `parentId` and `topParentId` point to document
- [ ] `doc.isOfficialParagraph: true` set on all
- [ ] `doc.order` preserved from original
- [ ] `doc.paragraphType` preserved from original
- [ ] `consensus: 1.0` for official paragraphs
- [ ] Sign app displays documents correctly
- [ ] Main app displays documents correctly
- [ ] Mass Consensus app displays correctly
- [ ] Version control features work on migrated paragraphs

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Duplicate migration | Idempotent check before creating (queries for existing official paragraphs) |
| Missing creator | Uses system user or document creator |
| Large documents | Batch processing with pagination (500 doc limit per batch) |
| Partial failure | Resume-from flag for recovery |
| Data corruption | Dry-run mode for preview |

---

## Post-Migration Cleanup (Optional)

After verification, optionally remove the embedded `paragraphs[]` array:

```typescript
// scripts/cleanupParagraphsArray.ts
batch.update(docRef, {
  paragraphs: FieldValue.delete()
});
```

**Run only after all apps confirmed working with sub-statements.**

---

## Related Files

```
# Migration Script
scripts/migrateParagraphsToSubStatements.ts

# Type Definitions
packages/shared-types/src/models/TypeEnums.ts (StatementType enum)
packages/shared-types/src/models/paragraph/paragraphModel.ts
packages/shared-types/src/models/statement/StatementTypes.ts

# Helper Functions
packages/shared-types/src/models/statement/StatementUtils.ts (createParagraphStatement)

# Existing Sign App Migration (reference)
apps/sign/src/lib/migrations/migrateParagraphsToStatements.ts
```

---

## Notes

- The Sign app already has a similar migration implementation at `apps/sign/src/lib/migrations/migrateParagraphsToStatements.ts` which serves as lazy migration on document load
- The CLI script provides bulk migration capability for all apps
- The `statementType: "paragraph"` is a new type added specifically for this migration to differentiate official paragraph documents from suggestion options
