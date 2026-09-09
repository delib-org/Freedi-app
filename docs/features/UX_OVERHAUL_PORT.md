# UX improvements in the playful main app

Imported from `feat/ux-overhaul` at `46d6ff750` into `codex/main-app-playful`.

The port keeps the current ThinkingSpace shell, landing page, engagement guide,
unread indicators, PWA badges, and the newer versioned agreement workflow.
The source worktree changed branches during the work; final translations and
source comparisons use the pinned commit rather than its mutable checkout.

## Integrated behavior

- One guided add sheet on Home and statement pages, also used by mind maps.
  It handles answers, questions and groups, optional idea refinement, splitting
  multiple ideas, and supporting a similar existing answer. Publishing uses
  the existing subscribed-statement writer. Map additions are persisted.
- Host tools organize live controls, people, answers, results, advanced settings,
  and insights into six sections with shareable section links and saved feedback.
- Answer discussions offer improved wording as a separate answer linked to the
  original. Existing evaluations stay on the original. Facilitator permission
  comes from the parent question. The existing message-to-answer action and
  structured-debate improvement flow remain in use.
- First-run terms and optional research consent precede an optional notification
  step. Required participant questions appear afterwards; deep links survive.
- Map controls stay fixed inside the lower-left edge of each map and provide
  fit/center, zoom in, zoom out, and native fullscreen. Escape exits fullscreen.
- Source-branch view links resolve to current query tabs and screen routes.
  Current overview, themes, agreements, summaries and map tabs remain available.
- Stakeholder population inference uses distinct voters in the ancestor chain,
  with explicit declared populations still taking priority. Server progress,
  recalculation and shared types were ported together.
- Imported copy is present in all seven languages. Sheets use RTL direction,
  current dark/light colors, and nested-dialog keyboard focus/scroll locking.
  Field label backgrounds now follow the current theme.

## Validation

Frontend and backend TypeScript checks, main production/PWA build, focused
frontend tests (including existing engagement and notification regressions),
chain-voter and population-resolution tests. Browser component preview checked
Hebrew RTL layouts at desktop and 390px width in dark/light mode; preview files
were removed. Full multi-user/emulator E2E was not run in this port.

## Test deployment — 2026-09-09

Deployed the production/PWA build to https://freedi-test.web.app. Updated the
seven evaluation, statement, and progress functions, and deployed covenantWorkflow,
createAgreementHandoff, redeemAgreementHandoff, and ensureTopParentSubscription.
Firestore rules and the agreement scheduling index were released while preserving
existing remote indexes. Existing function runtime settings were preserved.

The live landing page loads, and the hosted HTML, manifest, notification worker,
badge store, and PWA service worker match the local build. Fresh frontend and
backend builds passed with the locally packed shared dependencies. The agreement
metadata validator now restricts kind to the three supported agreement kinds.

The new AI agreement functions (deliberation, queueDeliberation, and
updateDeliberations) remain undeployed pending permission to configure the existing
test OpenAI credential. Automatic approval review rejected retrieving and storing
that credential in a temporary deployment file without explicit authorization.
Full multi-user agreement testing remains outstanding. No Git commit was made.

## Production deployment — 2026-09-09

Deployed the production/PWA build to https://app.wizcol.com using the explicit
`wizcol-app` Firebase project and hosting site. Firestore rules and 147 composite
indexes were released, preserving every existing production index and adding the
agreement scheduling index.

Deployed all 14 scoped backend functions. This updated the existing evaluation,
statement, progress, and subscription functions and added covenantWorkflow,
createAgreementHandoff, redeemAgreementHandoff, deliberation, queueDeliberation,
and updateDeliberations with the production environment configuration.

The frontend and functions production builds passed, as did 16 focused tests for
fullscreen state, PWA badge synchronization, and engagement suggestions. The live
HTML, manifest, notification worker, badge store, and PWA service worker match the
local production build byte for byte. A browser check confirmed that the public
landing page renders and its navigation is accessible. Full multi-user agreement
testing remains outstanding. No Git commit was made.

A follow-up hosting release fixed the landing-page language control in dark mode:
the language code and menu text now use high-contrast theme colors, and the menu
stays above the hero artwork and cards.

A second follow-up keeps the proposal list focused on the Raw and Synthesis
layers, moves cluster exploration to the Cluster map under Maps, and removes the
legacy discussion-summary controls outside the Summary tab. Dark-mode layer text
and the light-mode language and mail icons now use explicit high-contrast theme
colors. Active filter and layer chips also preserve their inverse text colour
inside the Thinking Space shell. The production build passed and the hosted index
matches the local build.

The embedded Cluster map now sizes itself to the map canvas instead of a second
viewport, and its fit, zoom, and native-fullscreen controls stay fixed at the
physical bottom-left. A browser check covered enter/exit fullscreen and the five
fullscreen hook tests pass.

The Mind map's legacy layout menu is now a labelled "Map layout" control fixed
to the physical bottom-right, separate from the bottom-left map controls,
including in native fullscreen.

A full button-contrast pass now covers 21 main-app routes in both light and dark
mode. Component button colours can override the Thinking Space's inherited ink;
primary, disabled, accessibility, map, unread-message, profile-avatar, language
hint, and muted-card colour pairs all meet the readability audit in both themes.

The Home page's previously unused left panel is now a localized “What's new”
feed. It combines unread notifications, recent contributions in subscribed
conversations, and newly created agreements from data already loaded for Home,
removes duplicate entries, and links each card to its source. When the feed is
empty, it invites the user to create an activity and opens the existing new
question flow. On narrower screens the panel uses the existing overlay toggle,
now labelled “What's new”. TypeScript, focused lint, all seven translation files,
and light/dark contrast pairs were verified; the Hebrew empty state was also
checked in the running local app.
