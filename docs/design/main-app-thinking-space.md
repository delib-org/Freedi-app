# Thinking together: main app redesign

Branch: `codex/main-app-playful`, based on `codex/main-app-redesign` / `f5c1088b3`.

## Experience

The main app now has a shared workspace shell: subscribed spaces on the left, a conversation in the center, and an optional “Taking shape” panel on the right. Mobile exposes the spaces and proposal panel through header buttons. Home has searchable conversation cards and a direct creation action. Warm neutral surfaces, plum accents, mint and yellow details, typographic hierarchy, and small geometric illustrations establish a friendly visual language.

The new palette is scoped to `.thinking-space`, with semantic variables, OS dark mode, explicit preview theme overrides, high-contrast borders, logical RTL layout, visible keyboard focus, and reduced-motion support. Landing, maps, and covenant copy is translated into all seven supported languages through the existing dictionary.

## Decision-making principles

- Topics organize; synthesized proposals represent equivalent contributions; neither indicates a final group decision.
- The sidebar includes recent visible proposals, not a ranking. It uses the existing grouped-view selector so condensation visibility is respected.
- Original contribution counts describe source statements, not unique supporters.
- Average sentiment is a signed score. It is not the percentage of people supporting a proposal. Evaluator counts remain visible when results are enabled, and the existing minimum sample convention flags early impressions.
- Hidden evaluation results remain hidden. No new convergence formula or confidence claim is introduced.
- An authorized conversation message can become a proposal through an explicit action, using the existing mutation and hierarchy validation. A halted process disables this shortcut.

## Integration

The main home and statement components use the new shell. Existing authentication, database subscriptions, chat, question/compound flows, evaluation/voting, maps, member controls, and facilitator menus remain in place. The statement view resets correctly on navigation and preserves other URL query parameters. Message input avoids auto-opening a mobile keyboard, labels its action, rejects blank submissions, and respects IME composition.

## Review locally

Run `npm run dev` with your normal local Firebase environment, or run `npx vite --host 127.0.0.1 --port 5187` and open `/redesign.html` for the isolated example.

The example uses the same shell, home, welcome and proposal-board components with local sample data. Its conversation body, ratings, and source dialog are illustrative; changes live only in memory. It never imports Firebase or the app store. This HTML is a development entry and is not included in the production build's default `index.html` entry.

Use `/redesign.html?view=home` to start at Home. Try posting, replying, creating a proposal, changing a rating, inspecting original contributions, searching Home, and the mobile/RTL/dark controls.

## Validation

- Production TypeScript compilation and Vite build.
- Focused unit tests for proposal visibility, source counts, signed sentiment, hidden results, and early samples.
- `node scripts/verify-thinking-space.cjs` exercises the example on port 5187: posting/replying, proposal creation, rating updates, original contributions, Home search, conversation creation, mobile navigation, RTL and dark mode.
- The authenticated main app was also smoke-tested against a separate `demo-freedi-redesign` project in local Firebase emulators. The full-app launcher uses its own Auth emulator on port 9399 so ordinary login remains in the demo namespace.

The emulator check exercises the actual app components with local fixtures. It is not a production-data or complete facilitator-flow test. No production configuration, data or deployment was changed.
