# Freedi / WizCol — Apps at a Glance

One monorepo, one Firebase backend (Firestore, Auth, Cloud Functions in `functions/`), many front-ends. Shared code lives in `packages/` (`shared-types`, `shared-i18n`, `shared-styles`, `shared-utils`, `shared-charts`, `event-core`, `engagement-core`, `evidence`, `deliberation-brain`, `e2e-shared`).

| App | Where | Stack | One-line purpose |
|---|---|---|---|
| **Main app (Freedi)** | repo root (`src/`) | React + Redux + Vite | The full deliberation platform |
| **Mass Consensus (MC)** | `apps/mass-consensus` | Next.js (SSR) | Crowd-sourced solutions at scale, no login needed |
| **Sign** | `apps/sign` | Next.js | Public documents: read, sign, suggest edits, vote |
| **Studio** | `apps/studio` | — | Facilitator console to create/run events across all apps |
| **Join** | `apps/join` | Mithril + Vite | Lightweight participant entry point to join a live discussion |
| **Join-class** | `apps/join-class` | Vite | Classroom app ("WizCol Class"): teacher-led lessons, tables, proposals, voting |
| **Agora** | `apps/agora` | Mithril + Vite | 45-minute classroom deliberation game (Hebrew-first, RTL) |
| **Odyssey** | `apps/odyssey` | — | Israeli pre-election civic-voice voyage game; preface to Agora |
| **Flow** | `apps/flow` | Mithril + Vite | Guided step-by-step wizard: challenge → needs → solutions → evaluate |
| **Chat** | `apps/chat` | SvelteKit (SSR) | Dialectical chat: replies are Strengthen / Critique, AI rewrites the statement |
| **Admin** | `apps/admin` | Mithril + Vite | Read-only operations dashboard for platform operators |

## Main app (Freedi) — repo root
The original and most complete product. Groups hold discussions as trees of **statements** (questions, options, comments). Members submit solutions, evaluate them with continuous feedback (agree/disagree scale) instead of plain voting, and a consensus score ranks results. Includes voting, mind maps, AI synthesis/theming ("Re-theme with AI"), notifications, subscriptions and roles. **Good for:** teams, organizations and communities making decisions together, drafting policies, brainstorming, public consultations.

## Mass Consensus (MC)
Fast, server-rendered pages where anyone can anonymously submit solutions and evaluate batches of others' ideas (swipe-style cards, -1…+1 scale), with AI feedback and auto-merge of similar ideas. **Good for:** large audiences, events and surveys that need near-instant load and zero sign-up friction.

## Sign
View a public document paragraph by paragraph, sign it, suggest alternative wording and vote on changes; admins control how winning edits replace text (auto / timer / manual). **Good for:** charters, bylaws, policies and open letters that need community sign-off and co-editing.

## Studio
Facilitator/consultant app to create, manage and run events and activities spanning the other apps, including an AI planner ("Start with AI") and organization boards. **Good for:** professional facilitators running many sessions for organizations.

## Join
Small, fast mobile-first app for participants to enter a live discussion via link: splash, login, main hub, solutions, chat, invites. **Good for:** getting people into a session in seconds, e.g. at a live event.

## Join-class (WizCol Class)
Classroom process host. Teachers build a lesson plan; students take part at tables with timed stages (talk, propose, vote), projector view, teacher console, results summary. **Good for:** teachers running structured group deliberation lessons.

## Agora
A 45-minute classroom game with stages, a village/3D visual world, teacher console and scoring (ScoreHud), where students deliberate together. Hebrew-first. **Good for:** civic-education sessions (grades ~7–9). Partly superseded for classroom hosting by Join-class.

## Odyssey
A voyage-style game on Israeli civic voice before elections; players sail with a crew of personas and finish by moving into Agora. Supports Hebrew/English/Arabic. **Good for:** engaging, narrative onboarding into civic deliberation.

## Flow
Guided wizard that walks one person or group through: state a challenge, name needs, write solutions, evaluate, see top solutions, and share. **Good for:** newcomers who need a structured path rather than the open-ended main app.

## Chat
Debate chat where every reply must be typed (Strengthen or Critique), threads nest infinitely, and an AI summarizes and proposes an improved version of the original statement. **Good for:** turning heated online arguments into iterative, constructive truth-seeking.

## Admin
Read-only dashboard (Mithril, custom SVG charts) showing platform activity, statement types, app traffic, users and admins, over daily/monthly/yearly views. **Good for:** operators monitoring health and growth; writes happen elsewhere.
