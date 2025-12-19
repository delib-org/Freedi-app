# @freedi/shared-styles

A comprehensive SCSS-based design system for the Freedi application ecosystem. This package provides design tokens, mixins, utility classes, animations, and component base styles that can be shared across all Freedi apps.

## Philosophy

This design system is built on pure SCSS - no component libraries like MUI. This approach provides:

- **Simplicity**: Just SCSS files, no runtime overhead
- **Flexibility**: Easy to customize and extend
- **Consistency**: Shared tokens ensure all apps look unified
- **Restylability**: Change tokens in one place, update everything

## Installation

The package is already part of the monorepo. Add it to your app's dependencies:

```json
{
  "dependencies": {
    "@freedi/shared-styles": "*"
  }
}
```

## Usage

### Import Everything

In your main SCSS file (e.g., `style.scss`):

```scss
@use '@freedi/shared-styles';
```

This imports all tokens, utilities, animations, and component styles.

### Import Specific Parts

For more control, import only what you need:

```scss
// Tokens only (CSS custom properties)
@use '@freedi/shared-styles/tokens';

// Mixins only (no CSS output until used)
@use '@freedi/shared-styles/mixins' as mix;

// Utility classes
@use '@freedi/shared-styles/utilities';

// Animations
@use '@freedi/shared-styles/animations';

// Component base styles
@use '@freedi/shared-styles/components';
```

### In Component SCSS Modules

For component-specific styles, import tokens and mixins:

```scss
// MyComponent.module.scss
@use '@freedi/shared-styles/tokens' as *;
@use '@freedi/shared-styles/mixins' as *;

.myComponent {
  padding: var(--spacing-4);
  background: var(--card-default);
  border-radius: var(--radius-card);

  @include card-interactive;

  @include mobile {
    padding: var(--spacing-2);
  }
}
```

## Design Tokens

### Colors

```scss
// Brand
var(--brand-primary)        // #5f88e5 - Main brand blue
var(--brand-primary-light)  // #80a0ea
var(--brand-primary-dark)   // #285edc
var(--brand-secondary)      // #1f5895 - Deep trust blue
var(--brand-accent)         // #7cacf8

// Semantic
var(--color-agree)          // #57c6b2 - Consensus (teal)
var(--color-disagree)       // #fe6ba2 - Disagreement (soft pink)
var(--color-success)        // #4fab9a
var(--color-error)          // #f74a4d
var(--color-warning)        // #ef7550
var(--color-info)           // #47b4ef

// Text
var(--text-title)           // #191e29
var(--text-subtitle)        // #2a3346
var(--text-body)            // #3d4d71
var(--text-caption)         // #7484a9
var(--text-disabled)        // #909ebc

// Backgrounds
var(--bg-primary)           // #f2f6ff - Main app background
var(--bg-secondary)         // #ffffff - Cards
var(--bg-tertiary)          // #f5fcff - Inputs

// Buttons
var(--btn-primary)          // Primary button color
var(--btn-primary-hover)    // Hover state
var(--btn-disabled)         // Disabled state

// Cards
var(--card-default)         // #ffffff
var(--card-question)        // #d9f0fc
var(--card-suggestion)      // #fdffe0
var(--card-error)           // #fff5f5
var(--card-success)         // #f0fdf4
```

### Spacing

Based on 8-point grid:

```scss
var(--spacing-1)   // 4px
var(--spacing-2)   // 8px
var(--spacing-3)   // 12px
var(--spacing-4)   // 16px (default)
var(--spacing-6)   // 24px
var(--spacing-8)   // 32px
var(--spacing-12)  // 48px
var(--spacing-16)  // 64px

// Semantic
var(--spacing-xs)  // 4px
var(--spacing-sm)  // 8px
var(--spacing-md)  // 16px
var(--spacing-lg)  // 24px
var(--spacing-xl)  // 32px
```

### Typography

```scss
// Font Families
var(--font-primary)  // 'Roboto' - Headlines
var(--font-body)     // 'Open Sans' - Body text
var(--font-accent)   // 'Patrick Hand' - Decorative
var(--font-mono)     // 'Source Code Pro' - Code

// Font Sizes
var(--text-xs)    // 14px
var(--text-sm)    // 15px
var(--text-base)  // 16px
var(--text-lg)    // 18px
var(--text-xl)    // 20px
var(--text-2xl)   // 24px
var(--text-3xl)   // 28px
var(--text-4xl)   // 32px

// Font Weights
var(--font-regular)   // 400
var(--font-medium)    // 500
var(--font-semibold)  // 600
var(--font-bold)      // 700

// Line Heights
var(--leading-tight)    // 1.2
var(--leading-snug)     // 1.3
var(--leading-normal)   // 1.5
var(--leading-relaxed)  // 1.6
```

### Border Radius

```scss
var(--radius-sm)      // 3px
var(--radius-md)      // 5px
var(--radius-lg)      // 8px - Cards
var(--radius-xl)      // 12px - Modals
var(--radius-button)  // 20px - Buttons
var(--radius-full)    // 9999px - Circles
```

### Shadows

```scss
var(--shadow-xs)    // Subtle
var(--shadow-sm)    // Small
var(--shadow-md)    // Default cards
var(--shadow-lg)    // Elevated
var(--shadow-xl)    // Heavy elevation
var(--shadow-2xl)   // Modals
var(--shadow-focus) // Focus ring
```

### Transitions

```scss
// Durations
var(--duration-fast)     // 100ms
var(--duration-normal)   // 200ms
var(--duration-slow)     // 300ms
var(--duration-slower)   // 500ms

// Easings
var(--easing-ease)       // ease
var(--easing-smooth)     // Natural motion
var(--easing-spring)     // Bouncy
var(--easing-bounce)     // Heavy bounce
```

### Z-Index

```scss
var(--z-dropdown)       // 100
var(--z-sticky)         // 200
var(--z-fixed)          // 300
var(--z-drawer)         // 400
var(--z-modal-backdrop) // 500
var(--z-modal)          // 600
var(--z-popover)        // 700
var(--z-tooltip)        // 800
var(--z-toast)          // 900
```

## Mixins

### Responsive Breakpoints

```scss
@include mobile { }        // < 600px
@include sm { }            // >= 600px
@include md { }            // >= 768px
@include lg { }            // >= 1024px
@include xl { }            // >= 1440px
@include reduced-motion { } // prefers-reduced-motion
```

### Buttons

```scss
@include button-base;      // Base button styles
@include button-primary;   // Filled blue button
@include button-secondary; // Outlined button
@include button-ghost;     // Text-only button
@include button-agree;     // Green/teal button
@include button-disagree;  // Pink outlined button
@include button-danger;    // Red button
@include button-disabled;  // Disabled state
@include button-sm;        // Small size
@include button-lg;        // Large size
@include button-full-width; // 100% width
```

### Cards

```scss
@include card-base;        // Base card styles
@include card-elevated;    // Enhanced shadow + hover lift
@include card-interactive; // Clickable card
@include card-flat;        // No shadow, with border
@include card-question;    // Light blue, question type
@include card-suggestion;  // Light yellow
@include card-error;       // Light red
@include card-success;     // Light green
```

### Inputs

```scss
@include input-base;       // Base input styles
@include input-error;      // Error state
@include input-success;    // Success state
@include input-sm;         // Small size
@include input-lg;         // Large size
@include textarea;         // Textarea styles
@include select;           // Select dropdown
@include checkbox;         // Checkbox
@include radio;            // Radio button
@include toggle;           // Toggle switch
```

### Typography

```scss
@include heading-base;     // Heading styles
@include body-text;        // Body text
@include caption;          // Caption text
@include truncate;         // Ellipsis overflow
@include line-clamp(2);    // Multi-line truncation
```

### Layout

```scss
@include flex-center;      // Center both axes
@include flex-between;     // Space between
@include stack($gap);      // Vertical flex with gap
@include cluster($gap);    // Horizontal flex with wrap
@include grid-auto-fit($min, $gap); // Responsive grid
@include container($max);  // Centered container
@include absolute-fill;    // Cover parent
```

### Shadows

```scss
@include shadow-sm;        // Small shadow
@include shadow-md;        // Medium shadow
@include shadow-lg;        // Large shadow
@include shadow-hover-lift; // Lift on hover
```

### Accessibility

```scss
@include visually-hidden;  // Screen reader only
@include focus-visible;    // Focus styles
@include skip-link;        // Skip to content link
@include reduced-motion;   // Respect motion preference
```

### RTL Support

```scss
@include rtl { }           // RTL-specific styles
@include ltr { }           // LTR-specific styles
@include margin-inline($start, $end);
@include padding-inline($start, $end);
```

## Utility Classes

Use utility classes directly in HTML for rapid prototyping:

```html
<div class="flex justify-between items-center gap-4 p-4">
  <h2 class="text-xl font-semibold text-title">Title</h2>
  <button class="btn btn--primary">Action</button>
</div>
```

### Available Utilities

- **Display**: `.hidden`, `.flex`, `.grid`, `.block`, `.inline-flex`
- **Flexbox**: `.flex-col`, `.justify-center`, `.items-center`, `.gap-4`
- **Spacing**: `.m-4`, `.p-4`, `.mx-auto`, `.mt-2`, `.mb-4`
- **Typography**: `.text-lg`, `.font-bold`, `.text-center`, `.truncate`
- **Colors**: `.text-title`, `.text-body`, `.bg-primary`, `.bg-secondary`
- **Borders**: `.border`, `.rounded-lg`, `.rounded-full`
- **Shadows**: `.shadow`, `.shadow-lg`, `.shadow-none`
- **Position**: `.relative`, `.absolute`, `.sticky`
- **Overflow**: `.overflow-hidden`, `.overflow-auto`

## Component Classes

Pre-built BEM component classes:

### Button

```html
<button class="btn btn--primary">Primary</button>
<button class="btn btn--secondary">Secondary</button>
<button class="btn btn--primary btn--lg">Large</button>
<button class="btn btn--primary btn--disabled" disabled>Disabled</button>
```

### Card

```html
<div class="card card--elevated">
  <div class="card__header">
    <h3 class="card__title">Title</h3>
  </div>
  <div class="card__body">
    Content here
  </div>
  <div class="card__footer">
    <button class="btn btn--primary">Action</button>
  </div>
</div>
```

### Form

```html
<div class="form-field">
  <label class="form-field__label">Email</label>
  <input class="input" type="email" />
  <span class="form-field__helper">We'll never share your email</span>
</div>
```

### Badge

```html
<span class="badge">5</span>
<span class="badge badge--success">New</span>
<span class="badge badge--notification">3</span>
```

## Animations

### Animation Classes

```html
<div class="animate-fade-in">Fades in</div>
<div class="animate-slide-in-up">Slides up</div>
<div class="animate-scale-in">Scales in</div>
<div class="animate-spin">Spinning</div>
<div class="animate-pulse">Pulsing</div>
<div class="animate-shimmer">Loading skeleton</div>
```

### Keyframes Available

- `fadeIn`, `fadeOut`
- `slideInUp`, `slideInDown`, `slideInLeft`, `slideInRight`
- `scaleIn`, `scaleOut`, `zoomIn`, `zoomOut`
- `spin`, `pulse`, `bounce`, `shake`
- `toastSlideIn`, `modalFadeIn`, `bottomSheetSlideUp`
- `skeleton`, `shimmer`

## Best Practices

### 1. Always Use Tokens

```scss
// ✅ Good
.myComponent {
  color: var(--text-body);
  background: var(--card-default);
  padding: var(--spacing-4);
}

// ❌ Bad
.myComponent {
  color: #3d4d71;
  background: white;
  padding: 16px;
}
```

### 2. Use Mixins for Complex Patterns

```scss
// ✅ Good
.myButton {
  @include button-primary;
  @include button-lg;
}

// ❌ Bad - Duplicating button styles
.myButton {
  display: inline-flex;
  padding: 0.5rem 1rem;
  // ... 20 more lines
}
```

### 3. Mobile-First Responsive

```scss
.myComponent {
  padding: var(--spacing-2); // Mobile default

  @include sm {
    padding: var(--spacing-4); // Larger screens
  }

  @include lg {
    padding: var(--spacing-6); // Desktop
  }
}
```

### 4. Respect User Preferences

```scss
.myAnimation {
  animation: fadeIn 0.3s ease;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}

// Or use the mixin
.myAnimation {
  animation: fadeIn 0.3s ease;
  @include reduced-motion;
}
```

### 5. Use BEM for Components

```scss
// Block
.card { }

// Element (part of block)
.card__header { }
.card__body { }

// Modifier (variant)
.card--elevated { }
.card--interactive { }
```

## Restyling the App

To restyle the entire application:

1. **Change colors**: Edit `scss/tokens/_colors.scss`
2. **Change spacing**: Edit `scss/tokens/_spacing.scss`
3. **Change typography**: Edit `scss/tokens/_typography.scss`
4. **Change radii**: Edit `scss/tokens/_borders.scss`
5. **Change shadows**: Edit `scss/tokens/_shadows.scss`

All apps using the shared styles will update automatically!

## File Structure

```
packages/shared-styles/
├── scss/
│   ├── tokens/             # Design tokens (CSS variables)
│   │   ├── _colors.scss
│   │   ├── _spacing.scss
│   │   ├── _typography.scss
│   │   ├── _borders.scss
│   │   ├── _shadows.scss
│   │   ├── _transitions.scss
│   │   ├── _z-index.scss
│   │   ├── _breakpoints.scss
│   │   ├── _sizes.scss
│   │   └── index.scss
│   ├── mixins/             # SCSS mixins
│   │   ├── _responsive.scss
│   │   ├── _typography.scss
│   │   ├── _buttons.scss
│   │   ├── _cards.scss
│   │   ├── _inputs.scss
│   │   ├── _layout.scss
│   │   ├── _accessibility.scss
│   │   ├── _shadows.scss
│   │   ├── _rtl.scss
│   │   └── index.scss
│   ├── utilities/          # Utility classes
│   │   └── index.scss
│   ├── animations/         # Keyframes & animation classes
│   │   └── index.scss
│   ├── components/         # Component base styles
│   │   └── index.scss
│   └── index.scss          # Main entry point
├── package.json
└── README.md
```

## Contributing

When adding new styles:

1. **Tokens**: Add to appropriate token file
2. **Mixins**: Add to appropriate mixin file
3. **Components**: Follow BEM naming
4. **Document**: Update this README

Always ensure:
- WCAG AA color contrast
- Reduced motion support
- RTL compatibility
- Mobile-first approach
