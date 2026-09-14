# Thinking together: main app redesign

Branch: `codex/main-app-playful`, based on `codex/main-app-redesign` / `f5c1088b3`.

## Experience

The main app now has a shared workspace shell: subscribed spaces on the left, a conversation in the center, and an optional “Taking shape” panel on the right. Mobile exposes the spaces and proposal panel through header buttons. Home has searchable conversation cards and a direct creation action. Warm neutral surfaces, plum accents, mint and yellow details, typographic hierarchy, and small geometric illustrations establish a friendly visual language.

The playful brand is selected explicitly by the main HTML entry and defined in the shared design-token package, with semantic variables, dark mode, high contrast, logical RTL layout, keyboard focus and reduced-motion support. Landing, maps, and covenant copy is translated into all seven supported languages through the existing dictionary.

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

Run `npm run dev` with your normal local Firebase environment. For isolated review, start `npm run dev:redesign:emulators`, run `npm run seed:redesign`, then launch `npm run dev:redesign`, `npm run dev:redesign:functions`, and `npm run dev:redesign:sign`.

The standalone prototype was retired. All review now uses the live application against dedicated emulators; see [the workflow guide](agreement-workflow.md) for ports and verification commands.
