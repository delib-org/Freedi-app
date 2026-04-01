# Sign App Migration Plan

> **Status**: MVP In Progress
> **Target**: `/apps/sign` (Next.js 14)
> **Source**: `/Users/talyaron/Documents/FreeDi-sign` (React + Vite)

---

## Overview

Migrate the freedi-sign document signing app to Next.js 14 as a sub-app in the Freedi-app monorepo.

### Key Decisions

| Decision | Choice |
|----------|--------|
| Framework | Next.js 14 App Router |
| State Management | Hybrid (Server components + Zustand for UI) |
| Authentication | Shared with main Freedi app (Firebase Auth) |
| Data Model | Statement → paragraphs (with `paragraphType` field) → Comments |
| Admin Panel | Separate page route (`/doc/[id]/admin`) |
| Deployment | Vercel (port 3002) |
| Approach | Minimal MVP first |

---

## Phase 1: MVP - Core Document View

### 1.1 Project Setup
- [x] Create `/apps/sign` directory
- [x] Initialize Next.js 14 with TypeScript
- [x] Configure `package.json` with dependencies
- [x] Set up `next.config.js` with shared-i18n transpilation
- [x] Configure `tsconfig.json` with path aliases
- [x] Create `vercel.json` for deployment

### 1.2 Firebase Infrastructure
- [x] Copy Firebase Admin SDK setup from mass-consensus
- [x] Create `src/lib/firebase/admin.ts`
- [x] Create `src/lib/firebase/queries.ts` with core queries:
  - [x] `getDocumentForSigning(documentId)`
  - [x] `getParagraphsByParent(parentId)`
  - [x] `getUserSignature(documentId, userId)`
  - [x] `getUserApprovals(documentId, userId)`
- [x] Set up environment variables

### 1.3 Authentication
- [x] Create `src/lib/utils/user.ts` (copy from mass-consensus)
- [x] Implement `getUserFromRequest()` for shared auth
- [x] Create login page at `/app/login/page.tsx`
- [x] Add Google OAuth button
- [x] Add anonymous login option
- [x] Create `src/lib/firebase/client.ts` (Firebase Client SDK)
- [x] Implement session cookie handling

### 1.4 UI State (Zustand)
- [x] Create `src/store/uiStore.ts` with minimal state:
  - [x] `activeModal` (comments modal)
  - [x] `modalContext` (paragraph context)
  - [x] Actions: `openComments()`, `closeModal()`

### 1.5 Core Components
- [x] Create `src/components/document/DocumentView.tsx` (server)
- [x] Create `src/components/document/DocumentClient.tsx` (client wrapper)
- [x] Create `src/components/paragraph/ParagraphCard.tsx`
- [x] Create `src/components/paragraph/InteractionBar.tsx`
- [x] Create `src/components/shared/Modal.tsx`
- [x] Create `src/components/shared/Button.tsx`
- [x] Create `src/components/comments/CommentThread.tsx`
- [x] Create `src/components/comments/Comment.tsx`

### 1.6 Pages
- [x] Create `/app/layout.tsx` with providers
- [x] Create `/app/page.tsx` (landing/redirect)
- [x] Create `/app/doc/[statementId]/page.tsx` (document view)
- [x] Create `/app/doc/[statementId]/loading.tsx` (skeleton)
- [x] Create `/app/login/page.tsx`

### 1.7 API Routes
- [x] Create `/app/api/auth/session/route.ts` (GET/DELETE)
- [x] Create `/app/api/signatures/[docId]/route.ts` (GET/POST)
- [x] Create `/app/api/approvals/[paragraphId]/route.ts` (GET/POST)
- [x] Create `/app/api/comments/[paragraphId]/route.ts` (GET/POST)

### 1.8 i18n Integration
- [x] Import `@freedi/shared-i18n` package
- [x] Set up `NextTranslationProvider` in layout
- [x] Add Sign-specific translation keys (all 6 languages)
- [x] Test Hebrew (RTL) and English (LTR)

### 1.9 Styling
- [x] Create `app/globals.scss` with design tokens
- [x] Create component SCSS modules following BEM
- [x] Add RTL support via mixins
- [x] Test mobile responsiveness

---

## Phase 2: Admin Panel

### 2.1 Admin Routes
- [x] Create `/app/doc/[statementId]/admin/page.tsx` (dashboard)
- [x] Create `/app/doc/[statementId]/admin/users/page.tsx`
- [x] Create `/app/doc/[statementId]/admin/settings/page.tsx`
- [x] Create `/app/doc/[statementId]/admin/layout.tsx` (with navigation)

### 2.2 Dashboard Features
- [x] Stat cards (participants, signatures, avg rating, comments)
- [x] Top insights (most engaged paragraphs)
- [ ] Heat map visualization (future enhancement)

### 2.3 User Management
- [x] Participants list with search
- [x] Filter by status (signed/rejected/viewed)
- [x] CSV export functionality
- [x] Display user stats (approvals, comments)

### 2.4 Document Settings
- [x] Visibility toggles (public, require login)
- [x] Interaction toggles (comments, approvals)
- [x] Display options (heat map mode, view counts)

### 2.5 API Routes for Admin
- [x] Create `/app/api/admin/stats/[docId]/route.ts`
- [x] Create `/app/api/admin/users/[docId]/route.ts`
- [x] Create `/app/api/admin/settings/[docId]/route.ts` (GET/PUT)
- [x] Create `/app/api/admin/export/[docId]/route.ts` (CSV)

---

## Phase 3: Integration & Polish

### 3.1 Data Model Update
- [x] Add `paragraphType` field to Statement in `delib-npm`
- [x] Types: Use ParagraphType enum from delib-npm
- [x] Update Valibot schema
- [x] Publish new delib-npm version

### 3.2 Main App Integration
- [x] Add URL helper `getSignDocumentUrl(statementId)` to main app
- [x] Add URL helper `getSignAdminUrl(statementId)` to main app
- [x] Add `canOpenInSignApp()` helper function
- [ ] Add navigation link from options to Sign app (future)
- [ ] Test cross-app authentication flow (future)

### 3.3 Translations
- [x] Complete all translation keys in shared-i18n
- [x] Add translations for: en, he, ar, de, es, nl

### 3.4 Testing & QA
- [x] RTL layout testing (Hebrew verified)
- [x] Mobile responsiveness testing (375px verified)
- [ ] Accessibility audit (WCAG AA) (future)
- [ ] Cross-browser testing (future)
- [x] Build optimization (production build passing)

### 3.5 Deployment
- [x] Configure Vercel project (vercel.json)
- [x] Create environment variables template (.env.example)
- [ ] Set environment variables on Vercel
- [ ] Deploy to staging
- [ ] Test production build
- [ ] Go live

---

## Project Structure

```
apps/sign/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.scss
│   ├── doc/[statementId]/
│   │   ├── page.tsx
│   │   ├── loading.tsx
│   │   ├── layout.tsx
│   │   └── admin/
│   │       ├── page.tsx
│   │       ├── users/page.tsx
│   │       └── settings/page.tsx
│   ├── login/
│   │   └── page.tsx
│   └── api/
│       ├── auth/session/route.ts
│       ├── signatures/[docId]/route.ts
│       ├── approvals/[paragraphId]/route.ts
│       ├── comments/[paragraphId]/route.ts
│       └── admin/
│           ├── stats/[docId]/route.ts
│           ├── users/[docId]/route.ts
│           ├── settings/[docId]/route.ts
│           └── export/[docId]/route.ts
├── src/
│   ├── components/
│   │   ├── document/
│   │   │   ├── DocumentView.tsx
│   │   │   └── DocumentClient.tsx
│   │   ├── paragraph/
│   │   │   ├── ParagraphCard.tsx
│   │   │   └── InteractionBar.tsx
│   │   ├── comments/
│   │   │   └── CommentThread.tsx
│   │   ├── admin/
│   │   │   ├── StatCard.tsx
│   │   │   ├── HeatMap.tsx
│   │   │   └── UserList.tsx
│   │   └── shared/
│   │       ├── Modal.tsx
│   │       └── Button.tsx
│   ├── lib/
│   │   ├── firebase/
│   │   │   ├── admin.ts
│   │   │   └── queries.ts
│   │   └── utils/
│   │       └── user.ts
│   ├── hooks/
│   │   └── useAuth.ts
│   ├── store/
│   │   └── uiStore.ts
│   └── types/
│       └── index.ts
├── public/
├── next.config.js
├── tsconfig.json
├── package.json
└── vercel.json
```

---

## Critical Reference Files

| File | Location | Why |
|------|----------|-----|
| Firebase Admin | `/apps/mass-consensus/src/lib/firebase/admin.ts` | Copy initialization pattern |
| Queries | `/apps/mass-consensus/src/lib/firebase/queries.ts` | Follow query patterns |
| Layout | `/apps/mass-consensus/app/layout.tsx` | i18n provider setup |
| User Utils | `/apps/mass-consensus/src/lib/utils/user.ts` | Anonymous user handling |
| Document Page | `/FreeDi-sign/src/view/pages/doc/Document.tsx` | Logic to migrate |
| Statements Slice | `/FreeDi-sign/src/controllers/slices/statementsSlice.ts` | Data model reference |
| Signature Logic | `/FreeDi-sign/src/controllers/db/sign/setSignature.ts` | Business logic |
| SCSS Mixins | `/src/view/style/_mixins.scss` | RTL and responsive mixins |

---

## Package.json Template

```json
{
  "name": "@freedi/sign",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build",
    "start": "next start -p 3002",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@freedi/shared-i18n": "file:../../packages/shared-i18n",
    "clsx": "^2.1.0",
    "delib-npm": "^5.6.71",
    "firebase-admin": "^12.0.0",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "18.3.0",
    "@types/react-dom": "18.3.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0",
    "sass": "^1.94.2",
    "typescript": "^5.3.0"
  }
}
```

---

## Progress Summary

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: MVP | In Progress | 29/35 tasks |
| Phase 2: Admin | Not Started | 0/18 tasks |
| Phase 3: Polish | Partially Done | 1/14 tasks |
| **Total** | **In Progress** | **30/67 tasks** |

---

## Notes

- **Data Source**: Pull from main app's `statementType === 'option'`
- **Port**: Sign app runs on 3002 (mass-consensus on 3001, main app on 5173)
- **Auth Flow**: Shared Firebase Auth - logged into Freedi = logged into Sign
- **delib-npm**: `paragraphType` field added

## Next Steps (Remaining MVP Tasks)

1. Implement Firebase Auth session handling in login page
2. Create comments API route
3. Create CommentThread component
4. Create shared Button component
5. Add Sign-specific translation keys
6. Test RTL layout
7. Test mobile responsiveness

---

## Phase 4: Paragraph Integration (Main App → Sign App)

> **Status**: ✅ Complete
> **Goal**: Use paragraphs from main app's `Statement.paragraphs[]` array in Sign app

### Background

The main app now stores rich text content as a `paragraphs[]` array on the Statement object:

```typescript
// Main app paragraph structure (src/types/paragraph.ts)
interface Paragraph {
  paragraphId: string;
  type: ParagraphType; // h1-h6, paragraph, li
  content: string;
  order: number;
  listType?: 'ul' | 'ol';
}

// Extended Statement
interface StatementWithParagraphs extends Statement {
  paragraphs?: Paragraph[];
}
```

### Tasks

#### 4.1 Type Definitions
- [x] Add `Paragraph` interface to Sign app types (`src/types/index.ts`)
- [x] Add `StatementWithParagraphs` interface
- [x] Import `ParagraphType` enum from delib-npm (already available)

#### 4.2 Query Updates
- [x] Update `getDocumentForSigning()` to return `StatementWithParagraphs`
- [x] Add `getParagraphsFromStatement()` helper function
- [ ] Update `getDocumentStats()` to work with embedded paragraphs

#### 4.3 Component Updates
- [x] Update `DocumentView.tsx` to handle `Paragraph[]` instead of `Statement[]`
- [x] Update `ParagraphCard.tsx` to accept `Paragraph` type
- [x] Update `InteractionBar.tsx` to use `paragraphId` (already did)

#### 4.4 Approval System Updates
- [x] Update `Approval` interface to use `paragraphId`
- [x] Update approval API routes to work with `paragraphId`
- [x] Update `ProgressBar` to track paragraph approvals (already compatible)

#### 4.5 Comments System Updates
- [x] Decision: Comments stored as child Statements with `parentId` = `paragraphId`
- [x] Update comment API to use `documentId` as `topParentId`
- [x] `CommentThread` component already passes correct params

### Data Flow

```
Main App                           Sign App
=========                          ========
Statement
  ├─ statement (title)      →      Document Header
  ├─ description           →      (auto-generated preview)
  └─ paragraphs[]          →      ParagraphCard list
       ├─ paragraphId      →      → Approval tracking
       ├─ type             →      → Heading/paragraph/list rendering
       ├─ content          →      → Display text
       └─ order            →      → Sort order
```

### Migration Notes

- **Backwards Compatibility**: Support both old (child Statements) and new (paragraphs array) approaches
- **Approval ID Format**: `{userId}--{paragraphId}` (not statementId)
- **Comment Parent**: Comments reference `paragraphId` in their `parentId` field
