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

## Archive

The `_archive/` folder contains the original detailed recommendation files (01 through 07) and the older architecture documents (FREEDI_ARCHITECTURE, SYSTEM_ARCHITECTURE, ARCHITECTURE_PHILOSOPHY). Their content has been consolidated into the main ARCHITECTURE.md.
