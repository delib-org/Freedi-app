# Freedi Atomic Design System

This directory contains the **Atomic Design System** components for the Freedi app. These are minimal TypeScript wrappers around BEM-styled SCSS classes.

## Philosophy

- **All styling in SCSS** - React components are TypeScript wrappers only
- **BEM methodology** - Predictable, maintainable naming
- **Atomic hierarchy** - Atoms → Molecules → Organisms
- **Design tokens** - All values from CSS variables

## Directory Structure

```
atomic/
├── atoms/                  # Basic building blocks
│   ├── Button/            # Button component
│   │   ├── Button.tsx    # React wrapper
│   │   ├── FAB.tsx       # Floating action button
│   │   └── index.ts      # Exports
│   └── ...
├── molecules/             # Combinations of atoms
│   ├── Card/             # Card component
│   │   ├── Card.tsx     # React wrapper
│   │   └── index.ts     # Exports
│   └── ...
└── README.md             # This file
```

## Usage

### Prerequisites

Install `clsx` for className concatenation (optional but recommended):

```bash
npm install clsx
```

### Importing Components

```typescript
// Import from atomic system
import { Button } from '@/view/components/atomic/atoms/Button';
import { Card } from '@/view/components/atomic/molecules/Card';

// Use in component
function MyComponent() {
  return (
    <Card variant="question" elevated>
      <p>Question content</p>
      <Button variant="primary" text="Vote" onClick={handleVote} />
    </Card>
  );
}
```

## Available Components

### Atoms

#### Button
```typescript
import { Button, FAB } from '@/view/components/atomic/atoms/Button';

// Basic usage
<Button text="Submit" variant="primary" onClick={handleClick} />

// With icon
<Button
  text="Next"
  variant="primary"
  icon={<ArrowIcon />}
  onClick={handleNext}
/>

// Loading state
<Button text="Saving..." variant="primary" loading />

// Floating Action Button
<FAB ariaLabel="Add new item" onClick={handleAdd}>
  <PlusIcon />
</FAB>
```

**Variants:**
- `primary` (default) - Blue filled button
- `secondary` - White with border
- `agree` - Green for positive actions
- `disagree` - Pink for negative actions
- `approve` - Green approve button
- `reject` - Red reject button
- `add` - Add/create action
- `cancel` - Cancel action
- `inactive` - Inactive state
- `icon` - Icon button
- `affirmation` - Affirmation button
- `outline-white` - White outline
- `outline-gray` - Gray outline

**Sizes:**
- `small` - Compact button
- `medium` (default) - Standard size
- `large` - Large button
- `mass-consensus` - Responsive mass consensus size

### Molecules

#### Card
```typescript
import { Card } from '@/view/components/atomic/molecules/Card';

// Basic usage
<Card>
  <p>Content goes here</p>
</Card>

// With header and footer
<Card
  title="Card Title"
  subtitle="Card subtitle"
  footer={<Button text="Action" variant="primary" />}
>
  <p>Card content</p>
</Card>

// Question card with elevation
<Card variant="question" elevated interactive onClick={handleClick}>
  <p>This is a question card</p>
</Card>

// Card with media
<Card
  media={<img src="/path/to/image.jpg" alt="Description" />}
  title="Media Card"
>
  <p>Content with media</p>
</Card>
```

**Variants:**
- `default` (default) - Standard white card
- `question` - Question card (blue tint)
- `suggestion` - Suggestion card (yellow tint)
- `message` - Message card (wheat tint)
- `error` - Error card (red accent)
- `success` - Success card (green accent)
- `warning` - Warning card (orange accent)
- `info` - Info card (blue accent)

**Shadows:**
- `none` - No shadow
- `sm` - Subtle shadow
- `md` (default) - Medium shadow
- `lg` - Large shadow

**Layout Options:**
- `compact` - Less padding
- `spacious` - More padding
- `horizontal` - Horizontal layout (image on left)
- `fullWidth` - 100% width
- `centered` - Centered content

**States:**
- `elevated` - Elevated shadow with hover effect
- `interactive` - Clickable with hover effect
- `selected` - Selected state (blue border)
- `disabled` - Disabled state
- `loading` - Loading state

## Styling Guide

### All styling is in SCSS files

**DO NOT** add styles in React components:

```typescript
// ❌ WRONG - Don't do this
const MyButton = styled.button`
  background: blue;
  padding: 1rem;
`;

// ❌ WRONG - Don't do this
<button style={{ background: 'blue', padding: '1rem' }}>Click</button>

// ✅ CORRECT - Use BEM classes from SCSS
<button className="button button--primary">Click</button>
```

### Customizing Components

To customize a component:

1. **Use existing variants** if possible:
   ```typescript
   <Button variant="primary" size="large" />
   ```

2. **Add custom classes** for specific overrides:
   ```typescript
   <Button
     variant="primary"
     className="my-special-button"
   />
   ```

   ```scss
   // In your component's SCSS module
   .my-special-button {
     min-width: 200px;
   }
   ```

3. **Add new variants to SCSS** for reusable modifications:
   ```scss
   // In src/view/style/atoms/_button.scss
   .button {
     &--custom-variant {
       background: var(--custom-color);
     }
   }
   ```

### Adding New Components

#### 1. Create SCSS file

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

#### 2. Add to atoms index

```scss
// src/view/style/atoms/_index.scss
@import 'button';
@import 'input';
@import 'my-atom';  // Add this
```

#### 3. Create React component

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

#### 4. Create index file

```typescript
// src/view/components/atomic/atoms/MyAtom/index.ts
export { default } from './MyAtom';
export { default as MyAtom } from './MyAtom';
export type { MyAtomProps } from './MyAtom';
```

## TypeScript Types

All components are fully typed:

```typescript
import type { ButtonProps, ButtonVariant } from '@/view/components/atomic/atoms/Button';
import type { CardProps, CardVariant } from '@/view/components/atomic/molecules/Card';

// Use types in your components
const MyComponent: React.FC = () => {
  const [variant, setVariant] = useState<ButtonVariant>('primary');

  return <Button variant={variant} text="Click me" />;
};
```

## Accessibility

All components include accessibility features:

- **ARIA labels**: Use `ariaLabel` prop
- **Keyboard navigation**: Tab order and focus states
- **Screen readers**: Semantic HTML and ARIA attributes
- **Loading states**: `aria-busy` for async operations
- **Disabled states**: Proper `disabled` and `aria-disabled` attributes

```typescript
// Good accessibility
<Button
  text="Submit Form"
  ariaLabel="Submit the registration form"
  loading={isSubmitting}
  disabled={!isValid}
/>

<Card
  interactive
  onClick={handleClick}
  tabIndex={0}
  aria-label="Question card - click to view details"
>
  Content
</Card>
```

## Migration from Old Components

### Gradual Migration Strategy

1. **New pages use atomic components**
2. **Old pages keep existing components**
3. **Migrate page by page** (not component by component)
4. **Delete old components** when all pages migrated

### Example Migration

**Before (old component):**
```typescript
import Button from '@/view/components/buttons/button/Button';

<Button buttonType={ButtonType.PRIMARY} text="Submit" onClick={handleClick} />
```

**After (atomic component):**
```typescript
import { Button } from '@/view/components/atomic/atoms/Button';

<Button variant="primary" text="Submit" onClick={handleClick} />
```

## Best Practices

1. **Use design tokens**: Always use CSS variables
   ```scss
   // ✅ Good
   background: var(--btn-primary);

   // ❌ Bad
   background: #5f88e5;
   ```

2. **Keep components minimal**: TypeScript wrappers only
   ```typescript
   // ✅ Good - Minimal wrapper
   const Button = ({ text, variant }) => (
     <button className={`button button--${variant}`}>{text}</button>
   );

   // ❌ Bad - Too much logic
   const Button = ({ text }) => {
     const [hover, setHover] = useState(false);
     return <button onMouseEnter={() => setHover(true)}>...</button>;
   };
   ```

3. **Follow BEM naming**: Predictable class names
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

4. **Mobile-first responsive**: Design for small screens first
   ```scss
   .button {
     font-size: 0.9rem;  // Mobile default

     @media (min-width: 768px) {
       font-size: 1rem;  // Desktop
     }
   }
   ```

## Troubleshooting

### Styles not applying?

1. Check that SCSS files are imported in `style.scss`:
   ```scss
   @import './atoms/index';
   @import './molecules/index';
   ```

2. Verify BEM class names are correct:
   ```typescript
   // Correct
   className="button button--primary"

   // Incorrect
   className="btn primary"
   ```

3. Check browser console for CSS loading errors

### TypeScript errors?

1. Ensure you're importing types correctly:
   ```typescript
   import type { ButtonProps } from '@/view/components/atomic/atoms/Button';
   ```

2. Check that all required props are provided:
   ```typescript
   // Error: Missing 'text' prop
   <Button variant="primary" />

   // Correct
   <Button text="Click me" variant="primary" />
   ```

## Resources

- [Design Guide](../../../../docs/design-guide.md) - Complete design system documentation
- [BEM Methodology](http://getbem.com/) - Official BEM documentation
- [Atomic Design](https://bradfrost.com/blog/post/atomic-web-design/) - Brad Frost's original article

## Contributing

When adding new components:

1. Follow the atomic hierarchy (atoms → molecules → organisms)
2. Use BEM naming convention
3. Keep React components minimal (TypeScript wrappers only)
4. Add TypeScript types for all props
5. Include accessibility features
6. Document usage in this README
7. Test on mobile, tablet, and desktop
8. Verify RTL support

---

*Last Updated: November 2025*
