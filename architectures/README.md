# Freedi Architecture Documentation

This folder contains comprehensive architecture documentation for all components of the Freedi platform.

## Documentation Index

| Document | Description |
|----------|-------------|
| [MAIN_APP_ARCHITECTURE.md](./MAIN_APP_ARCHITECTURE.md) | Main React SPA - deliberation platform |
| [FUNCTIONS_ARCHITECTURE.md](./FUNCTIONS_ARCHITECTURE.md) | Firebase Cloud Functions - serverless backend |
| [MC_APP_ARCHITECTURE.md](./MC_APP_ARCHITECTURE.md) | Mass Consensus - crowdsourced evaluation |
| [SIGN_APP_ARCHITECTURE.md](./SIGN_APP_ARCHITECTURE.md) | Sign - document signing & deliberation |
| [EMBEDDINGS_CLUSTERING_ARCHITECTURE.md](./EMBEDDINGS_CLUSTERING_ARCHITECTURE.md) | Hybrid embeddings/LLM for similarity & clustering |

## Platform Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FREEDI PLATFORM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Main App   │  │    MC App    │  │   Sign App   │         │
│  │   (React)    │  │  (Next.js)   │  │  (Next.js)   │         │
│  │              │  │              │  │              │         │
│  │ Deliberation │  │  Consensus   │  │   Document   │         │
│  │   Platform   │  │   Building   │  │   Signing    │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                 │                 │                  │
│         └─────────────────┼─────────────────┘                  │
│                           │                                    │
│                    ┌──────┴───────┐                            │
│                    │   Firebase   │                            │
│                    │  Functions   │                            │
│                    │  (50+ fns)   │                            │
│                    └──────┬───────┘                            │
│                           │                                    │
│                    ┌──────┴───────┐                            │
│                    │   Firebase   │                            │
│                    │  Firestore   │                            │
│                    └──────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack Summary

| Component | Framework | State | Styling | Port |
|-----------|-----------|-------|---------|------|
| Main App | React + Vite | Redux Toolkit | SCSS Modules | 5173 |
| Functions | Node.js | Stateless | N/A | N/A |
| MC App | Next.js 14 | React Context | CSS Modules | 3001 |
| Sign App | Next.js 14 | Zustand | SCSS Modules | 3002 |

## Shared Infrastructure

All apps share:

- **Firebase Project**: Single Firestore database, Auth, FCM
- **Type Definitions**: `delib-npm`, `@freedi/shared-types`
- **Internationalization**: `@freedi/shared-i18n`
- **Data Model**: Unified Statement-based composite pattern

## Key Data Collections

| Collection | Used By | Purpose |
|------------|---------|---------|
| `statements` | All | Main content (questions, options, documents) |
| `statementsSubscribe` | Main, Functions | User subscriptions |
| `evaluations` | All | User evaluations |
| `signatures` | Sign | Document signatures |
| `approval` | Sign | Paragraph approvals |
| `surveys` | MC | Multi-question surveys |

## Development

### Running All Apps

```bash
# Main App (port 5173)
cd /home/user/Freedi-app
npm run dev

# MC App (port 3001)
cd /home/user/Freedi-app/apps/mass-consensus
npm run dev

# Sign App (port 3002)
cd /home/user/Freedi-app/apps/sign
npm run dev

# Functions (emulator)
cd /home/user/Freedi-app/functions
npm run serve
```

### Environment Switching

```bash
npm run env:dev    # Development
npm run env:test   # Testing
npm run env:prod   # Production
```

## Quick Reference

### Main App Entry Points
- Entry: `src/main.tsx`
- Root: `src/App.tsx`
- Router: `src/routes/router.tsx`
- Store: `src/redux/store.ts`

### Functions Entry Points
- Index: `functions/src/index.ts`
- Database: `functions/src/db.ts`
- AI Service: `functions/src/services/ai-service.ts`

### MC App Entry Points
- Layout: `apps/mass-consensus/app/layout.tsx`
- Question: `apps/mass-consensus/app/q/[statementId]/page.tsx`
- Queries: `apps/mass-consensus/src/lib/firebase/queries.ts`

### Sign App Entry Points
- Layout: `apps/sign/app/layout.tsx`
- Document: `apps/sign/app/doc/[statementId]/page.tsx`
- Stores: `apps/sign/src/store/`
