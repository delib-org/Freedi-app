# Component Architecture and Best Practices

This document outlines a comprehensive strategy for improving component architecture, standardizing patterns, and enhancing code reusability in the Freedi app.

## Current Issues

1. **Inconsistent Component Structure**: Mix of patterns and file organization
2. **Styling Inconsistency**: Mix of CSS modules and regular SCSS files  
3. **Icon System Chaos**: SVG files, React components, and Lucide icons mixed
4. **Large Monolithic Components**: Some components exceed 300+ lines
5. **Missing Component Patterns**: No clear guidelines for component creation

## 1. Standardized Component Structure

### 1.1 Component File Organization

```
src/
  components/
    ComponentName/
      index.ts                 # Export barrel
      ComponentName.tsx        # Main component
      ComponentName.module.scss # Styles (CSS modules)
      ComponentName.types.ts   # TypeScript interfaces
      ComponentName.test.tsx   # Tests
      ComponentName.stories.tsx # Storybook stories
      hooks/                   # Component-specific hooks
        useComponentLogic.ts
      components/              # Sub-components
        SubComponent.tsx
```

### 1.2 Component Template

```typescript
// ComponentName.types.ts
export interface ComponentNameProps {
  className?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'small' | 'medium' | 'large';
  // ... other props
}

// ComponentName.tsx
import React, { FC, memo } from 'react';
import cn from 'classnames';
import styles from './ComponentName.module.scss';
import { ComponentNameProps } from './ComponentName.types';

export const ComponentName: FC<ComponentNameProps> = memo(({
  className,
  children,
  variant = 'primary',
  size = 'medium',
  ...props
}) => {
  return (
    <div 
      className={cn(
        styles.component,
        styles[`component--${variant}`],
        styles[`component--${size}`],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

ComponentName.displayName = 'ComponentName';

// index.ts
export { ComponentName } from './ComponentName';
export type { ComponentNameProps } from './ComponentName.types';
```

## 2. Unified Icon System

### 2.1 Migration to Lucide React

```typescript
// src/components/Icon/Icon.tsx
import { LucideIcon, LucideProps } from 'lucide-react';
import * as icons from 'lucide-react';
import cn from 'classnames';
import styles from './Icon.module.scss';

export type IconName = keyof typeof icons;

export interface IconProps extends LucideProps {
  name: IconName;
  className?: string;
}

export const Icon: FC<IconProps> = ({ name, className, size = 24, ...props }) => {
  const LucideIcon = icons[name] as LucideIcon;
  
  if (!LucideIcon) {
    console.error(`Icon "${name}" not found`);
    return null;
  }
  
  return (
    <LucideIcon 
      className={cn(styles.icon, className)} 
      size={size}
      {...props}
    />
  );
};

// Usage
<Icon name="Home" />
<Icon name="Settings" size={20} />
<Icon name="User" className="custom-class" />
```

### 2.2 Custom Icon Component for Legacy SVGs

```typescript
// src/components/Icon/CustomIcon.tsx
import { FC, SVGProps } from 'react';
import cn from 'classnames';
import styles from './Icon.module.scss';

// Import all custom SVGs
const customIcons = {
  freediLogo: () => import('./custom/freedi-logo.svg?react'),
  customPattern: () => import('./custom/pattern.svg?react'),
  // Add other custom icons
};

export type CustomIconName = keyof typeof customIcons;

interface CustomIconProps extends SVGProps<SVGSVGElement> {
  name: CustomIconName;
  size?: number;
}

export const CustomIcon: FC<CustomIconProps> = ({ 
  name, 
  size = 24, 
  className,
  ...props 
}) => {
  const [IconComponent, setIconComponent] = useState<FC<SVGProps<SVGSVGElement>> | null>(null);
  
  useEffect(() => {
    customIcons[name]().then((module) => {
      setIconComponent(() => module.default);
    });
  }, [name]);
  
  if (!IconComponent) return null;
  
  return (
    <IconComponent
      className={cn(styles.icon, className)}
      width={size}
      height={size}
      {...props}
    />
  );
};
```

### 2.3 Icon Migration Script

```javascript
// scripts/migrate-icons.js
const fs = require('fs');
const path = require('path');

const iconMappings = {
  // Map old icon names to Lucide equivalents
  'homeIcon.svg': 'Home',
  'settingsIcon.svg': 'Settings',
  'userIcon.svg': 'User',
  'closeIcon.svg': 'X',
  'editIcon.svg': 'Edit',
  'deleteIcon.svg': 'Trash2',
  'plusIcon.svg': 'Plus',
  'minusIcon.svg': 'Minus',
  // Add all mappings
};

// Script to find and replace icon imports
function migrateIcons(directory) {
  // Implementation to scan files and replace icon imports
}
```

## 3. CSS Modules Standardization

### 3.1 CSS Module Structure

```scss
// ComponentName.module.scss
@import '@/styles/variables';
@import '@/styles/mixins';

.component {
  // Base styles
  
  &--primary {
    // Variant styles
  }
  
  &--secondary {
    // Variant styles
  }
  
  &--small {
    // Size variant
  }
  
  &--medium {
    // Size variant
  }
  
  &__header {
    // Element styles (BEM)
  }
  
  &__content {
    // Element styles
  }
  
  // States
  &.is-active {
    // Active state
  }
  
  &.is-disabled {
    // Disabled state
  }
  
  // Responsive
  @include tablet {
    // Tablet styles
  }
  
  @include mobile {
    // Mobile styles
  }
}
```

### 3.2 Shared Style System

```scss
// src/styles/_variables.scss
:root {
  // Colors
  --color-primary: #007bff;
  --color-secondary: #6c757d;
  --color-success: #28a745;
  --color-danger: #dc3545;
  --color-warning: #ffc107;
  
  // Spacing
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  // Typography
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-md: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  
  // Borders
  --border-radius-sm: 4px;
  --border-radius-md: 8px;
  --border-radius-lg: 16px;
  
  // Shadows
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
}

// src/styles/_mixins.scss
@mixin button-base {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-md);
  font-weight: 500;
  transition: all 0.2s ease;
  cursor: pointer;
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

@mixin mobile {
  @media (max-width: 767px) {
    @content;
  }
}

@mixin tablet {
  @media (min-width: 768px) and (max-width: 1023px) {
    @content;
  }
}

@mixin desktop {
  @media (min-width: 1024px) {
    @content;
  }
}
```

## 4. Component Composition Patterns

### 4.1 Compound Components

```typescript
// src/components/Card/Card.tsx
interface CardComponent extends FC<CardProps> {
  Header: FC<CardHeaderProps>;
  Body: FC<CardBodyProps>;
  Footer: FC<CardFooterProps>;
}

const Card: CardComponent = ({ children, className }) => {
  return (
    <div className={cn(styles.card, className)}>
      {children}
    </div>
  );
};

const CardHeader: FC<CardHeaderProps> = ({ children, className }) => (
  <div className={cn(styles.card__header, className)}>
    {children}
  </div>
);

const CardBody: FC<CardBodyProps> = ({ children, className }) => (
  <div className={cn(styles.card__body, className)}>
    {children}
  </div>
);

const CardFooter: FC<CardFooterProps> = ({ children, className }) => (
  <div className={cn(styles.card__footer, className)}>
    {children}
  </div>
);

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

// Usage
<Card>
  <Card.Header>
    <h2>Title</h2>
  </Card.Header>
  <Card.Body>
    <p>Content</p>
  </Card.Body>
  <Card.Footer>
    <Button>Action</Button>
  </Card.Footer>
</Card>
```

### 4.2 Render Props Pattern

```typescript
// src/components/DataProvider/DataProvider.tsx
interface DataProviderProps<T> {
  fetchData: () => Promise<T>;
  children: (props: {
    data: T | null;
    loading: boolean;
    error: Error | null;
    refetch: () => void;
  }) => React.ReactNode;
}

function DataProvider<T>({ fetchData, children }: DataProviderProps<T>) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>({
    data: null,
    loading: true,
    error: null,
  });

  const loadData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetchData();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({ data: null, loading: false, error: error as Error });
    }
  }, [fetchData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return <>{children({ ...state, refetch: loadData })}</>;
}

// Usage
<DataProvider fetchData={fetchStatements}>
  {({ data, loading, error, refetch }) => {
    if (loading) return <Loader />;
    if (error) return <ErrorMessage error={error} onRetry={refetch} />;
    return <StatementList statements={data} />;
  }}
</DataProvider>
```

## 5. Breaking Down Large Components

### 5.1 Component Decomposition Strategy

```typescript
// Before: Large monolithic component (300+ lines)
const StatementMain = () => {
  // Too much logic and JSX in one component
};

// After: Decomposed into smaller components
const StatementMain = () => {
  return (
    <StatementProvider>
      <StatementLayout>
        <StatementHeader />
        <StatementContent />
        <StatementActions />
      </StatementLayout>
    </StatementProvider>
  );
};

// StatementHeader.tsx
const StatementHeader = () => {
  const { statement } = useStatement();
  return (
    <header className={styles.header}>
      <StatementTitle statement={statement} />
      <StatementMetadata statement={statement} />
    </header>
  );
};

// StatementContent.tsx
const StatementContent = () => {
  const { statement, view } = useStatement();
  
  return (
    <div className={styles.content}>
      {view === 'chat' && <StatementChat />}
      {view === 'vote' && <StatementVoting />}
      {view === 'evaluation' && <StatementEvaluation />}
      {view === 'settings' && <StatementSettings />}
    </div>
  );
};
```

### 5.2 Custom Hooks for Logic Extraction

```typescript
// hooks/useStatementLogic.ts
export const useStatementLogic = (statementId: string) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  
  const statement = useAppSelector(state => 
    selectStatementById(state, statementId)
  );
  
  const { data: votes } = useGetVotesQuery(statementId);
  const [updateStatement] = useUpdateStatementMutation();
  
  const handleUpdate = useCallback(async (updates: Partial<Statement>) => {
    try {
      await updateStatement({ id: statementId, ...updates }).unwrap();
      toast.success('Statement updated');
    } catch (error) {
      toast.error('Failed to update statement');
    }
  }, [statementId, updateStatement]);
  
  const handleDelete = useCallback(async () => {
    if (!confirm('Are you sure?')) return;
    
    try {
      await deleteStatement(statementId);
      navigate('/');
    } catch (error) {
      toast.error('Failed to delete statement');
    }
  }, [statementId, navigate]);
  
  return {
    statement,
    votes,
    handleUpdate,
    handleDelete,
  };
};
```

## 6. Component Testing Strategy

### 6.1 Unit Tests

```typescript
// ComponentName.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentName } from './ComponentName';

describe('ComponentName', () => {
  it('renders with default props', () => {
    render(<ComponentName>Test Content</ComponentName>);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
  
  it('applies variant classes', () => {
    const { container } = render(
      <ComponentName variant="secondary">Content</ComponentName>
    );
    expect(container.firstChild).toHaveClass('component--secondary');
  });
  
  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<ComponentName onClick={handleClick}>Click me</ComponentName>);
    
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### 6.2 Integration Tests

```typescript
// StatementVoting.integration.test.tsx
import { renderWithProviders } from '@/test-utils';
import { StatementVoting } from './StatementVoting';
import { server } from '@/mocks/server';
import { rest } from 'msw';

describe('StatementVoting Integration', () => {
  it('submits vote successfully', async () => {
    const { user } = renderWithProviders(
      <StatementVoting statementId="123" />
    );
    
    // Click agree button
    await user.click(screen.getByRole('button', { name: /agree/i }));
    
    // Verify success message
    expect(await screen.findByText(/vote submitted/i)).toBeInTheDocument();
  });
  
  it('handles vote error', async () => {
    server.use(
      rest.post('/api/votes', (req, res, ctx) => {
        return res(ctx.status(500), ctx.json({ error: 'Server error' }));
      })
    );
    
    const { user } = renderWithProviders(
      <StatementVoting statementId="123" />
    );
    
    await user.click(screen.getByRole('button', { name: /agree/i }));
    
    expect(await screen.findByText(/failed to submit vote/i)).toBeInTheDocument();
  });
});
```

## 7. Storybook Integration

```typescript
// ComponentName.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ComponentName } from './ComponentName';

const meta: Meta<typeof ComponentName> = {
  title: 'Components/ComponentName',
  component: ComponentName,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary'],
    },
    size: {
      control: { type: 'select' },
      options: ['small', 'medium', 'large'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Default Component',
  },
};

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Primary Variant',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      <ComponentName size="small">Small</ComponentName>
      <ComponentName size="medium">Medium</ComponentName>
      <ComponentName size="large">Large</ComponentName>
    </div>
  ),
};
```

## Implementation Roadmap

### Week 1: Foundation
1. Set up component template and guidelines
2. Create Icon migration script
3. Establish CSS modules standards

### Week 2: Core Components
1. Refactor base components (Button, Input, Card)
2. Implement unified Icon system
3. Create component documentation

### Week 3: Feature Components
1. Break down large components
2. Extract custom hooks
3. Standardize component patterns

### Week 4: Testing & Documentation
1. Add component tests
2. Set up Storybook
3. Document component API

## Benefits

1. **Consistency**: Uniform component structure and patterns
2. **Maintainability**: Easier to find and update code
3. **Reusability**: Components can be easily shared and composed
4. **Performance**: Optimized rendering with proper memoization
5. **Developer Experience**: Clear patterns and documentation
6. **Testing**: Comprehensive test coverage

This architecture will significantly improve code quality, developer productivity, and application performance.