# @freedi/shared-styles

Shared design tokens, SCSS mixins, self-hosted fonts and the reusable
atom/molecule SCSS that every WizCol app builds on. Pure SCSS/CSS — no
build step, no JS. Consumers alias `@freedi/shared-styles` to
`packages/shared-styles/src` (see the root `vite.config.ts`).

## Layout

```
src/
├── _mixins.scss            # breakpoints, button-base, card-base, focus rings…
├── tokens/
│   ├── _variables.scss           # light theme (:root)
│   ├── _variables-dark.scss      # dark overrides (prefers-color-scheme / [data-theme])
│   ├── _variables-contrast.scss  # high-contrast overrides
│   └── _index.scss               # @use's the three above (light → dark → contrast)
├── fonts/
│   ├── fonts.css               # @font-face for Open Sans + Roboto (variable woff2)
│   ├── Open_Sans/
│   └── Roboto/
├── atoms/                  # _button, _badge, _input, _checkbox, _toggle, …
└── molecules/              # _card, _modal, _toast
```

## Import order

1. Mixins — `@use '@freedi/shared-styles/mixins' as *;`
2. Tokens — `@use '@freedi/shared-styles/tokens/index';` (or the three files
   individually if an app needs a different override order)
3. Atoms, then molecules — `@forward '@freedi/shared-styles/atoms/button';` etc.
4. Fonts — `@import '@freedi/shared-styles/fonts/fonts.css';` (plain CSS import;
   Vite inlines it and rewrites the relative `url()`s)

Atoms/molecules are written against `@use '../mixins' as *;` and only emit
CSS classes that read `var(--…)` tokens, so they render identically in any app
that loads the tokens first.

## What belongs here

Only files whose **sole** dependencies are `../mixins` and `var(--…)` design
tokens. Anything that imports an app-local partial, references app-specific
assets, or hard-codes a value that should be a token stays in the app that
owns it. Check the file's `@use`/`@import` lines before moving it in.

## Consuming from the main app

The main app keeps one-line shims at the original paths
(`src/view/style/_mixins.scss`, `src/view/style/atoms/_button.scss`, …) that
`@forward` the package file, so existing `@use '../mixins'` /
`@import '.../style/mixins'` consumers keep working without changes.
