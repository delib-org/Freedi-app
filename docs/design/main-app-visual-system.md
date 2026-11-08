# Main app visual system

The main HTML entry explicitly selects `data-brand="playful"`. The shared design-token package owns this opt-in brand in `packages/shared-styles/src/tokens/_brand-playful.scss`, including semantic aliases, light and dark colors, and high-contrast preferences. Other applications retain their chosen brand. `_thinking-space.scss` contains presentation and layout rules only; a shell never remaps core tokens.

Component modules own their cards, forms, navigation and spacing. They do not select a parent `.thinking-space` class. Playful color surfaces remain peach, lavender, mint and yellow, with readable themed ink and keyboard focus rings. Motion preference overrides remain explicit. No color-specific `!important` declarations are needed in the new components.

The main application uses a single question hierarchy and agreement workflow; the old standalone `redesign.html` prototype has been removed. All five map views use `Screen` enum values for links and rendering. Sign stays a separate Next.js app. Its single return link uses `NEXT_PUBLIC_MAIN_APP_URL`, falling back to normal Vite localhost:5173 in development; the isolated launcher explicitly selects localhost:5189.
