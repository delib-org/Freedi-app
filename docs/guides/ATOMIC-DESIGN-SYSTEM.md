# Freedi Atomic Design System Implementation

## Summary

This document summarizes the implementation of the Atomic Design System with BEM methodology for the Freedi app.

## What Was Implemented

### 1. SCSS Architecture (SCSS-First Approach)

#### Directory Structure
```
src/view/style/
├── _mixins.scss              # Reusable SCSS mixins
├── atoms/
│   ├── _index.scss           # Atoms index
│   ├── _button.scss          # Button atom (BEM)
│   ├── _input.scss           # Input atom (BEM)
│   └── _badge.scss           # Badge atom (BEM)
├── molecules/
│   ├── _index.scss           # Molecules index
│   ├── _card.scss            # Card molecule (BEM)
│   ├── _modal.scss           # Modal molecule (BEM)
│   └── _toast.scss           # Toast molecule (BEM)
└── style.scss                # Main import (updated)
```

#### Key Features
- **All styling in SCSS files** - No CSS-in-JS
- **BEM naming convention** - Predictable, maintainable class names
- **Design tokens** - All values from CSS variables
- **Responsive design** - Mobile-first approach
- **RTL support** - Full right-to-left language support
- **Accessibility** - WCAG AA compliant

### 2. React Components (TypeScript Wrappers)

#### Directory Structure
```
src/view/components/atomic/
├── atoms/
│   └── Button/
│       ├── Button.tsx        # Button component
│       ├── FAB.tsx           # Floating Action Button
│       └── index.ts          # Exports
├── molecules/
│   └── Card/
│       ├── Card.tsx          # Card component
│       └── index.ts          # Exports
└── README.md                 # Usage documentation
```

#### Key Features
- **Minimal TypeScript wrappers** - No styling logic
- **Fully typed** - Complete TypeScript interfaces
- **Accessible** - ARIA labels, keyboard navigation
- **Composable** - Easy to combine components

### 3. Documentation

#### Files Updated/Created
- ✅ `docs/design-guide.md` - Added Atomic Design and BEM sections
- ✅ `src/view/components/atomic/README.md` - Component usage guide
- ✅ `ATOMIC-DESIGN-SYSTEM.md` - This file

## Design System Components

### Atoms (Basic Building Blocks)

| Atom | File | BEM Class | Variants |
|------|------|-----------|----------|
| Button | `atoms/_button.scss` | `.button` | primary, secondary, agree, disagree, approve, reject, add, cancel, etc. |
| Input | `atoms/_input.scss` | `.input` | error, disabled, success, small, large |
| Badge | `atoms/_badge.scss` | `.badge` | notification, unread, success, warning, info, neutral |

### Molecules (Combinations of Atoms)

| Molecule | File | BEM Class | Variants |
|----------|------|-----------|----------|
| Card | `molecules/_card.scss` | `.card` | question, suggestion, message, error, success, warning, info |
| Modal | `molecules/_modal.scss` | `.modal` | small, medium, large, full-screen, bottom-sheet |
| Toast | `molecules/_toast.scss` | `.toast` | success, error, warning, info |

## BEM Naming Convention

### Structure
```
.block                // Component base
.block__element       // Part of component
.block--modifier      // Variant of component
```

### Examples

#### Button
```scss
.button                // Base button
.button__text          // Button text element
.button__icon          // Button icon element
.button--primary       // Primary variant
.button--large         // Size modifier
.button--disabled      // State modifier
```

#### Card
```scss
.card                  // Base card
.card__header          // Header element
.card__title           // Title element
.card__body            // Body element
.card__footer          // Footer element
.card--elevated        // Elevated shadow variant
.card--question        // Question type variant
.card--compact         // Size modifier
```

## Usage Examples

### Button Component

```typescript
import { Button } from '@/view/components/atomic/atoms/Button';

// Basic button
<Button text="Submit" variant="primary" onClick={handleClick} />

// Button with icon
<Button
  text="Next"
  variant="primary"
  icon={<ArrowIcon />}
  onClick={handleNext}
/>

// Loading button
<Button text="Saving..." variant="primary" loading />
```

### Card Component

```typescript
import { Card } from '@/view/components/atomic/molecules/Card';

// Basic card
<Card>
  <p>Content goes here</p>
</Card>

// Question card with elevation
<Card
  variant="question"
  elevated
  title="Question Title"
  footer={<Button text="Vote" variant="primary" />}
>
  <p>Question content</p>
</Card>

// Interactive card
<Card interactive onClick={handleClick}>
  <p>Clickable card</p>
</Card>
```

## Mixins Available

Located in `src/view/style/_mixins.scss`:

### Responsive
- `@include mobile { }` - Max-width 600px
- `@include tablet { }` - 601px - 1024px
- `@include desktop { }` - Min-width 1025px
- `@include large-desktop { }` - Min-width 1440px

### Buttons
- `@include button-base` - Base button styles
- `@include button-disabled` - Disabled button styles

### Cards
- `@include card-base` - Base card styles
- `@include card-elevated` - Elevated shadow
- `@include card-interactive` - Interactive hover effects

### Inputs
- `@include input-base` - Base input styles
- `@include input-error` - Error state styles

### Typography
- `@include heading-base` - Base heading styles
- `@include body-text` - Body text styles

### Animations
- `@include fade-in($duration)` - Fade in animation
- `@include slide-in-up($duration)` - Slide up animation
- `@include scale-in($duration)` - Scale in animation
- `@include respect-motion-preference` - Disable animations for prefers-reduced-motion

### Accessibility
- `@include visually-hidden` - Hide visually but keep for screen readers
- `@include focus-visible` - Focus styles

### RTL Support
- `@include rtl { }` - RTL-specific styles
- `@include ltr { }` - LTR-specific styles

### Shadows
- `@include shadow-subtle` - Subtle shadow
- `@include shadow-card` - Card shadow
- `@include shadow-elevated` - Elevated shadow
- `@include shadow-modal` - Modal shadow

### Truncation
- `@include truncate` - Single-line truncation with ellipsis
- `@include line-clamp($lines)` - Multi-line truncation

## Migration Strategy

### Gradual Co-existence

The new atomic design system can coexist with the old components:

```typescript
// OLD (existing components - keep for now)
import Button from '@/view/components/buttons/button/Button';

// NEW (atomic components - use in new code)
import { Button } from '@/view/components/atomic/atoms/Button';
```

### Migration Steps

1. **New pages/features** - Use atomic components
2. **Existing pages** - Keep old components (no rush to migrate)
3. **Page-by-page migration** - Migrate when you touch a page
4. **Delete old components** - When all pages migrated

## Benefits

### Maintainability
- **Single source of truth** - All styling in SCSS files
- **Easy to find** - BEM naming makes finding styles predictable
- **No duplication** - Shared styles via mixins and tokens

### Performance
- **No runtime CSS-in-JS** - Better performance
- **Better caching** - CSS files cached by browser
- **Smaller bundles** - No style library overhead

### Developer Experience
- **Clear hierarchy** - Atoms → Molecules → Organisms
- **Predictable naming** - BEM convention
- **TypeScript types** - Full type safety
- **Easy to extend** - Add new variants in SCSS

### Consistency
- **Design tokens** - All colors, spacing from variables
- **Reusable components** - Same atoms everywhere
- **Less CSS** - No duplicate styles

## Best Practices

### 1. Always Use Design Tokens
```scss
// ✅ Good
background: var(--btn-primary);
padding: var(--padding);

// ❌ Bad
background: #5f88e5;
padding: 16px;
```

### 2. Keep React Components Minimal
```typescript
// ✅ Good - TypeScript wrapper only
const Button = ({ text, variant }) => (
  <button className={`button button--${variant}`}>{text}</button>
);

// ❌ Bad - Styling logic in component
const Button = styled.button`
  background: blue;
`;
```

### 3. Follow BEM Naming
```scss
// ✅ Good
.button { }
.button__text { }
.button--primary { }

// ❌ Bad
.btn { }
.btnText { }
.primaryBtn { }
```

### 4. One Block Per File
```
_button.scss  → .button block
_card.scss    → .card block
_modal.scss   → .modal block
```

### 5. Mobile-First Responsive
```scss
.button {
  font-size: 0.9rem;  // Mobile default

  @media (min-width: 768px) {
    font-size: 1rem;  // Desktop
  }
}
```

## Adding New Components

### 1. Create SCSS File

```scss
// src/view/style/atoms/_my-atom.scss
@import '../mixins';

.my-atom {
  // Base styles
  padding: var(--padding);

  // Elements
  &__element {
    color: var(--text-body);
  }

  // Modifiers
  &--variant {
    background: var(--btn-primary);
  }
}
```

### 2. Add to Index

```scss
// src/view/style/atoms/_index.scss
@import 'button';
@import 'input';
@import 'my-atom';  // Add this
```

### 3. Create React Component

```typescript
// src/view/components/atomic/atoms/MyAtom/MyAtom.tsx
import React from 'react';
import clsx from 'clsx';

export interface MyAtomProps {
  variant?: 'default' | 'custom';
  className?: string;
  children: React.ReactNode;
}

const MyAtom: React.FC<MyAtomProps> = ({
  variant = 'default',
  className,
  children,
}) => {
  const classes = clsx(
    'my-atom',
    variant !== 'default' && `my-atom--${variant}`,
    className
  );

  return <div className={classes}>{children}</div>;
};

export default MyAtom;
```

## Testing Checklist

When adding/modifying components:

- [ ] Works on mobile (< 768px)
- [ ] Works on tablet (768px - 1440px)
- [ ] Works on desktop (> 1440px)
- [ ] Hover states work
- [ ] Focus states visible
- [ ] Disabled states clear
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Contrast ratios meet WCAG AA
- [ ] Works in RTL mode
- [ ] All colors use CSS variables
- [ ] TypeScript types complete
- [ ] Accessible (ARIA, keyboard)

## Dependencies

### Required
- **TypeScript** - Already installed
- **SCSS** - Already configured in Vite

### Optional but Recommended
- **clsx** - For className concatenation
  ```bash
  npm install clsx
  ```

## Resources

- [Design Guide](./docs/design-guide.md) - Complete design system documentation
- [Atomic README](./src/view/components/atomic/README.md) - Component usage guide
- [BEM Methodology](http://getbem.com/) - Official BEM documentation
- [Atomic Design](https://bradfrost.com/blog/post/atomic-web-design/) - Brad Frost's article

## Future Enhancements

### Atoms to Add
- [ ] Checkbox
- [ ] Radio button
- [ ] Icon wrapper
- [ ] Avatar
- [ ] Chip
- [ ] Loader/Spinner
- [ ] Link
- [ ] Text component

### Molecules to Add
- [ ] Form Group (label + input + error)
- [ ] Search Box (input + icon + clear)
- [ ] Dropdown
- [ ] Tooltip
- [ ] Toggle Switch
- [ ] Tab Bar
- [ ] Breadcrumbs

### Organisms to Add
- [ ] Header
- [ ] Navigation
- [ ] Sidebar
- [ ] Footer

## Notes

- The atomic design system is **production-ready** for new features
- Old components remain functional during gradual migration
- All new code should use atomic components
- Update this document when adding new components

---

**Implementation Date**: November 2025
**Version**: 1.0.0
**Status**: ✅ Ready for use
