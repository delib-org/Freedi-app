# Freedi Sign App

[![Freedi Sign](https://img.shields.io/badge/App-Sign%20App-blue)](https://sign.wizcol.com/)  
**A collaborative document signing and deliberation platform built with Next.js.**

## Overview

Freedi Sign is a web application for viewing, signing, and collaboratively editing public documents. It enables users to suggest alternative paragraphs, vote on changes, and achieve consensus-driven updates. Admins can configure version control modes to manage replacements automatically, on timers, or manually. This app is part of the [Freedi monorepo](https://github.com/delib-org/Freedi-app), leveraging Firebase for real-time data and AI for enhanced suggestions.

Key goals:
- Foster deliberative democracy through crowd-sourced document improvements.
- Ensure transparency with version histories, audit logs, and user notifications.
- Support scalability for high-engagement public docs (e.g., petitions, policies).

Live demo: [sign.wizcol.com](https://sign.wizcol.com) (Login with Google or continue as guest).

## Features

### User-Facing
- **Document Viewing & Signing**: Browse public documents, read paragraphs, and add digital signatures.
- **Paragraph Suggestions**: Propose alternatives to specific sections; view/vote on others' suggestions (up/down votes).
- **Consensus Indicators**: Real-time progress bars, thresholds, and badges showing suggestion status (e.g., "75% consensus").
- **Notifications**: Toasts for approved changes or personal suggestion updates.
- **Version History**: View timelines, compare diffs, and see past changes (read-only for users).

### Admin-Facing
- **Version Control Modes**:
  - **Automatic**: Real-time replacements above consensus threshold.
  - **Timer**: Scheduled batches with countdowns; optional approval.
  - **Manual**: Review queues with edit/approve/reject options.
- **Dashboards**: Configure thresholds, timers, and settings per document; monitor queues and audits.
- **Restoration**: Rollback to any version with notes.
- **Analytics**: Heat maps for engagement, vote breakdowns.

### Technical Highlights
- Real-time syncing via Firebase Firestore.
- AI integrations (OpenAI/Gemini) for suggestion refinements or summaries.
- Accessibility: WCAG AA compliant, RTL support (e.g., Hebrew), keyboard nav.
- Security: Role-based access (admin vs. user/guest), rate limiting on APIs.

## Architecture

- **Frontend**: Next.js 14 (App Router) for SSR/ISR, React components for UI.
- **State Management**: Zustand stores (e.g., for version control, replacement queues).
- **Backend**: Firebase Cloud Functions for logic (e.g., consensus calc, timers); API routes in `/app/api/` for endpoints like `/admin/version-control-settings`.
- **Data Model**: Documents as "statements" (from shared-types); new collections for queues and audits.
- **Styling**: SCSS with BEM conventions, design tokens for modes/thresholds.
- **Dependencies**: React, Redux Toolkit (if integrated), Firebase SDKs, Zustand, diff-match-patch (for comparisons).

Folder Structure:
- `/app/`: Next.js routes (e.g., `/doc/[statementId]` for document views, `/api/admin/` for endpoints).
- `/src/components/`: Reusable UI (e.g., `VersionTimeline.tsx`, `ReviewModal.tsx`).
- `/src/store/`: Zustand stores (e.g., `versionControlStore.ts`).
- `/public/`: Static assets.

## Getting Started

### Prerequisites
- Node.js 18+
- Yarn/npm
- Firebase project (configure via `.env.local` with keys from `firebase-config-templates`).

### Installation
1. Clone the monorepo: `git clone https://github.com/delib-org/Freedi-app.git`
2. Navigate: `cd apps/sign`
3. Install deps: `yarn install` (or `npm install`)
4. Set env vars (e.g., `NEXT_PUBLIC_FIREBASE_API_KEY=your_key`)
5. Run dev server: `yarn dev` (or `npm run dev`) – opens at `http://localhost:3002`

### Deployment
- Build: `yarn build`
- Deploy to Vercel/Netlify (auto-detects Next.js).
- Firebase: Deploy functions from repo root: `firebase deploy --only functions`

## Usage

1. **As User**: Visit `/`, login/guest, browse docs at `/doc/[id]`, suggest changes via buttons.
2. **As Admin**: Access `/doc/[id]/admin` for settings; configure modes in version control panel.
3. **Testing**: Use Playwright for E2E: `yarn test:e2e`.

## Contributing

- Follow [CLAUDE.md](https://github.com/delib-org/Freedi-app/blob/main/CLAUDE.md) guidelines.
- Issues/PRs welcome! Focus on bug fixes, feature enhancements (e.g., more AI integrations).
- Run lint/tests: `yarn lint`, `yarn test`.

## License

GPL v3 – See [LICENSE.md](https://github.com/delib-org/Freedi-app/blob/main/LICENSE.md).

## Contact

- Maintainer: @Talyaron
- Repo: [Freedi-app](https://github.com/delib-org/Freedi-app)

This README will evolve with the app—feel free to update!