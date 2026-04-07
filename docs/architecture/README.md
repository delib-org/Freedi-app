# Freedi Architecture Documentation

## Start Here

**[ARCHITECTURE.md](./ARCHITECTURE.md)** — The main architecture document. Covers what Freedi is, the deliberation process, the multi-app ecosystem, the unified Statement data model, client architecture patterns, the Popperian-Bayesian discussion mechanism, and known issues. Read this first.

## Reference Documents

These provide deeper detail on specific subsystems:

- **[IN_APP_NOTIFICATIONS_ARCHITECTURE.md](./IN_APP_NOTIFICATIONS_ARCHITECTURE.md)** — Full technical reference for the notification system (data models, services, service worker, hooks, Cloud Functions)
- **[ERROR_HANDLING_ROADMAP.md](./ERROR_HANDLING_ROADMAP.md)** — Task tracker for error handling improvements (what's done, what's remaining)
- **[IMPORT_ORGANIZATION.md](./IMPORT_ORGANIZATION.md)** — Standard 10-group import order for TypeScript files

## Cloud Functions

The `functions/` subdirectory contains critical documentation about scaling issues in Firebase Cloud Functions:

- **[functions/trigger-cascade-issues.md](./functions/trigger-cascade-issues.md)** — Analysis of admin escalation, notification explosion, and subscription update problems
- **[functions/trigger-cascade-solutions.md](./functions/trigger-cascade-solutions.md)** — Proposed solutions with code examples and rollout plan
- **[functions/new-subscription-architecture.md](./functions/new-subscription-architecture.md)** — Redesigned subscription system
- **[functions/implementation-guide-new-subscriptions.md](./functions/implementation-guide-new-subscriptions.md)** — Step-by-step implementation guide

## Legacy Documents

The following files contain detailed technical recommendations that have been summarized in the main ARCHITECTURE.md (Sections 10–11). They are kept for reference but the main document is the authoritative source:

- `01-critical-issues.md` — TypeScript strict mode, security, bundle size
- `02-redux-optimization.md` — Redux refactoring strategies
- `03-performance-optimization.md` — Bundle, rendering, and query optimization
- `04-error-handling-monitoring.md` — Error boundaries, Sentry, logging
- `05-component-architecture.md` — Component standardization, icon system, CSS Modules
- `06-testing-strategy.md` — Unit, integration, and E2E testing plans
- `07-developer-experience.md` — Deployment, git hooks, tooling
- `ARCHITECTURE_PHILOSOPHY.md` — Design patterns and recommended improvements
- `FREEDI_ARCHITECTURE.md` — Statement model details (now in ARCHITECTURE.md Section 4)
- `SYSTEM_ARCHITECTURE.md` — System overview (now in ARCHITECTURE.md Sections 1–6)
