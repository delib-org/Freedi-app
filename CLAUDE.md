# Freedi App Development Guide

## ⚠️ CRITICAL RULES - MUST FOLLOW

### TypeScript - ABSOLUTELY NO `any` TYPE
- **NEVER use `any` type** - use proper types, `unknown`, or specific interfaces
- All variables, parameters, and return types must be explicitly typed
- If you encounter an `any` type, replace it with the correct type immediately
- **ALWAYS check `delib-npm` package first** for existing types before creating new ones
  - Import types from `delib-npm` when available: `import { Statement, User, Role } from 'delib-npm';`
  - Only create custom types if they don't exist in `delib-npm`
- Examples of what NOT to do:
  ```typescript
  // ❌ WRONG - Never do this
  const data: any = fetchData();
  function process(input: any): any { }

  // ❌ WRONG - Don't create types that already exist in delib-npm
  interface Statement {
    statementId: string;
    // ...
  }

  // ✅ CORRECT - Always do this
  import { Statement, User } from 'delib-npm';
  const data: UserData = fetchData();
  function process(input: Statement): ProcessedStatement { }
  ```

### CSS/SCSS - NEVER Import Global Styles in Components
- **NEVER import global styles** in components: `import './styles.scss'` ❌
- **ONLY import CSS modules** in components: `import styles from './Component.module.scss'` ✅
- Global styles are imported ONLY ONCE in `main.tsx` from `style.scss`
- Each component should have its own `.module.scss` file if it needs styles
- Examples:
  ```typescript
  // ❌ WRONG - Never import global styles in a component
  import './styles.scss';
  import '../styles/global.scss';

  // ✅ CORRECT - Only import CSS modules
  import styles from './MyComponent.module.scss';
  ```

### Design System Guidelines
- **ALWAYS follow design system guidelines** from `docs/design-guide.md`
- **All UI/UX decisions must align** with the design guide
- **Color palette**: Use only CSS variables from the design system (e.g., `var(--btn-primary)`, `var(--agree)`)
  - Never hardcode colors: `#5f88e5` ❌, use `var(--btn-primary)` ✅
- **Typography**: Follow type scale (h1-h6, p) and use design tokens
- **Spacing**: Use 8-point grid system with spacing tokens (`var(--padding)`)
- **Component patterns**: Follow established patterns in design guide (buttons, cards, forms, modals)
- **Animations**: Use standard timing functions and durations from design guide
- **Accessibility**: All components must meet WCAG AA standards
- **Responsive**: Mobile-first approach with established breakpoints
- Examples:
  ```scss
  // ❌ WRONG - Hardcoded values
  .myButton {
    background-color: #5f88e5;
    padding: 16px;
    border-radius: 20px;
  }

  // ✅ CORRECT - Design tokens
  .myButton {
    background-color: var(--btn-primary);
    padding: var(--padding);
    border-radius: 20px; // Specific to button pattern
  }
  ```

### Atomic Design System - SCSS First Approach
- **ALWAYS use the atomic design system** for new UI components
- **All styling in SCSS files** - React components are TypeScript wrappers only
- **BEM naming convention** - Block Element Modifier for all CSS classes
- **Read documentation first**: `ATOMIC-DESIGN-SYSTEM.md` and `src/view/components/atomic/README.md`

#### Component Architecture
```
Atoms (Basic blocks)     → Button, Input, Badge, Icon
Molecules (Combinations) → Card, Modal, Toast, Form Group
Organisms (Sections)     → Header, Navigation, Complex layouts
```

#### File Organization
```
src/view/style/
├── atoms/           # All atom SCSS (button, input, badge, etc.)
├── molecules/       # All molecule SCSS (card, modal, toast, etc.)
└── _mixins.scss     # Reusable SCSS patterns

src/view/components/atomic/
├── atoms/           # React wrappers for atoms
└── molecules/       # React wrappers for molecules
```

#### Creating New Components

**1. SCSS First (Required)**
```scss
// src/view/style/atoms/_my-atom.scss
@import '../mixins';

.my-atom {
  // Base styles using design tokens
  padding: var(--padding);

  // Elements (parts of component)
  &__element {
    color: var(--text-body);
  }

  // Modifiers (variants)
  &--primary {
    background: var(--btn-primary);
  }

  &--large {
    font-size: 1.2rem;
  }
}
```

**2. Add to Index**
```scss
// src/view/style/atoms/_index.scss
@import 'button';
@import 'my-atom';  // Add new atom
```

**3. React Component (TypeScript Wrapper Only)**
```typescript
// src/view/components/atomic/atoms/MyAtom/MyAtom.tsx
import React from 'react';
import clsx from 'clsx';

export interface MyAtomProps {
  variant?: 'default' | 'primary';
  size?: 'small' | 'medium' | 'large';
  className?: string;
  children: React.ReactNode;
}

const MyAtom: React.FC<MyAtomProps> = ({
  variant = 'default',
  size = 'medium',
  className,
  children,
}) => {
  const classes = clsx(
    'my-atom',                                    // Block
    variant !== 'default' && `my-atom--${variant}`, // Modifier
    size !== 'medium' && `my-atom--${size}`,        // Modifier
    className
  );

  return <div className={classes}>{children}</div>;
};

export default MyAtom;
```

#### BEM Naming Rules
```scss
// Block (component)
.button { }                  // ✅ Component name

// Element (part of component)
.button__text { }            // ✅ Double underscore
.button__icon { }            // ✅ Part of button

// Modifier (variant/state)
.button--primary { }         // ✅ Double hyphen
.button--large { }           // ✅ Variant
.button--disabled { }        // ✅ State

// ❌ WRONG - Don't nest blocks
.card .button { }

// ❌ WRONG - Don't create grandchildren
.button__icon__svg { }

// ❌ WRONG - Don't use camelCase
.primaryButton { }
```

#### Usage Examples

**Existing Atomic Components:**
```typescript
import { Button } from '@/view/components/atomic/atoms/Button';
import { Card } from '@/view/components/atomic/molecules/Card';

// Button variants
<Button text="Submit" variant="primary" onClick={handleClick} />
<Button text="Cancel" variant="secondary" />
<Button text="Agree" variant="agree" />
<Button text="Loading..." variant="primary" loading />

// Card variants
<Card variant="question" elevated title="Question">
  <p>Content</p>
</Card>

<Card
  variant="error"
  footer={<Button text="Dismiss" variant="secondary" />}
>
  <p>Error message</p>
</Card>
```

#### SCSS Patterns to Follow

**Use Mixins:**
```scss
@import '../mixins';

.my-component {
  @include card-base;          // Reuse patterns
  @include mobile {            // Responsive
    padding: 0.5rem;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;           // Accessibility
  }
}
```

**Design Tokens Only:**
```scss
// ✅ CORRECT
.component {
  color: var(--text-body);
  background: var(--card-default);
  padding: var(--padding);
  border-radius: 8px;          // OK if specific to pattern
}

// ❌ WRONG - Never hardcode
.component {
  color: #3d4d71;
  background: #ffffff;
  padding: 16px;
}
```

#### What NOT to Do

```typescript
// ❌ WRONG - Don't put styling in React components
const StyledButton = styled.button`
  background: blue;
  padding: 1rem;
`;

// ❌ WRONG - Don't use inline styles
<button style={{ background: 'blue' }}>Click</button>

// ❌ WRONG - Don't import global SCSS in components
import './styles.scss';

// ✅ CORRECT - Use atomic components
import { Button } from '@/view/components/atomic/atoms/Button';
<Button text="Click" variant="primary" />
```

#### Migration from Old Components

**Coexistence Strategy:**
```typescript
// OLD (keep for now - don't change existing code)
import Button from '@/view/components/buttons/button/Button';

// NEW (use in new features)
import { Button } from '@/view/components/atomic/atoms/Button';
```

**When to Migrate:**
- ✅ New features → Use atomic components
- ✅ Major refactor → Migrate to atomic
- ⚠️ Small fixes → Keep existing (migrate later)
- ❌ Don't migrate for no reason

#### Resources
- **Implementation Guide**: `ATOMIC-DESIGN-SYSTEM.md` - Complete system overview
- **Component Docs**: `src/view/components/atomic/README.md` - Usage examples
- **Design Guide**: `docs/design-guide.md` - Atomic Design & BEM sections
- **Mixins**: `src/view/style/_mixins.scss` - All reusable patterns

## Commands
- Build: `npm run build`
- Dev: `npm run dev`
- Lint: `npm run lint` or `npm run lint:fix` to auto-fix issues
- Type check: `npm run typecheck`
- Check all: `npm run check-all` (runs lint, typecheck, and build)

### Testing
- Run specific test: `cd functions && npm test -- -t 'test name'`
- Watch tests: `cd functions && npm run test:watch`

## Code Style Guidelines
- **React**: Functional components with hooks only
- **Imports**: Add newline after imports
- **Formatting**: No multiple empty lines, newline before return statements
- **Naming**: camelCase for variables/functions, PascalCase for components/classes
- **Error handling**: Use try/catch for all async operations
- **Logging**: Only use `console.error` and `console.info` - no `console.log`
- **Component structure**: Keep components small and focused
- **Redux**: Use Redux Toolkit for state management
- **ESLint**: All code must pass ESLint checks before commit

## Timestamp Guidelines
- **ALWAYS use milliseconds** for all timestamp fields (createdAt, lastUpdate, lastChildUpdate, etc.)
- **Client-side**: Use `Date.now()` or `new Date().getTime()`
- **Firebase Functions**: Use `Date.now()` instead of `FieldValue.serverTimestamp()`
- **Never use**: `Timestamp.now()` without `.toMillis()`, `FieldValue.serverTimestamp()`, or raw `Date` objects
- **When reading from Firestore**: Always convert Timestamps using the helper function:
  ```typescript
  import { convertTimestampsToMillis } from '@/helpers/timestampHelpers';
  const data = convertTimestampsToMillis(doc.data());
  ```
- **Valibot validation**: All timestamp fields must be `number()`