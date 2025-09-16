# Import Organization Guidelines for TSX Files

This document defines the standard import organization for all TypeScript React (TSX) files in the Freedi app codebase. Following these guidelines ensures consistency and maintainability across the project.

## Import Groups Order

Imports should be organized into 10 distinct groups, separated by blank lines, in the following order:

### 1. React Core
React library, hooks, and React type definitions
```typescript
import { FC, useState, useEffect, ReactNode } from 'react';
```

### 2. Third-party Libraries
External packages from node_modules (excluding React and custom npm packages)
```typescript
import { useParams, useLocation, Outlet } from 'react-router';
import { useSelector, useDispatch } from 'react-redux';
import { ReactFlowProvider } from 'reactflow';
```

### 3. NPM Packages
Your custom npm packages
```typescript
import { Statement, Role, StatementType, Screen } from 'delib-npm';
```

### 4. Redux Store
Redux store, slices, selectors, and Redux-related imports
```typescript
import { RootState } from '@/redux/store';
import { statementSelector, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
```

### 5. Database
Database calls and controllers from @/controllers/db
```typescript
import { listenToStatements } from '@/controllers/db/statements/listenToStatements';
import { getNewStatementsFromSubscriptions } from '@/controllers/db/subscriptions/getSubscriptions';
import { listenToInAppNotifications } from '@/controllers/db/inAppNotifications/db_inAppNotifications';
```

### 6. Internal Absolute Imports
Utilities, helpers, and other internal logic using @ alias (excluding DB and hooks)
```typescript
import { isAdmin } from '@/controllers/general/helpers';
import { FilterType } from '@/controllers/general/sorting';
```

### 7. App Hooks
Custom application hooks from controllers/hooks
```typescript
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
```

### 8. Components
Reusable components from the components directory
```typescript
import Button from '@/view/components/buttons/button/Button';
import Modal from '@/view/components/modal/Modal';
import Input from '@/view/components/input/Input';
```

### 9. Icons
SVG icons, icon components, and icon libraries
```typescript
import BackIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import HomeIcon from '@/assets/icons/homeIcon.svg?react';
import { SmileIcon, ChevronLeft } from 'lucide-react';
```

### 10. Local Imports
Relative imports and local modules, organized by type, followed by styles on a separate line
```typescript
// Local Imports - Hooks
import { useHeader } from './HeaderContext';
import { useLocalState } from '../hooks/useLocalState';

// Local Imports - Components
import GroupPage from '../statementTypes/group/GroupPage';

// Local Imports - Utilities
import { formatData } from './utils';

import styles from './HeaderMassConsensus.module.scss';
```

## Complete Example

Here's a properly organized import section from a component:

```typescript
// React Core
import { FC, useState, useEffect, ReactNode } from 'react';

// Third-party Libraries
import { useParams, useLocation } from 'react-router';
import { useSelector } from 'react-redux';

// NPM Packages
import { Statement, Role, StatementType } from 'delib-npm';

// Redux Store
import { statementSelector, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';

// Database
import { listenToStatements } from '@/controllers/db/statements/listenToStatements';

// Internal Absolute Imports
import { isAdmin } from '@/controllers/general/helpers';

// App Hooks
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

// Components
import Button from '@/view/components/buttons/button/Button';
import Modal from '@/view/components/modal/Modal';

// Icons
import BackIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import HomeIcon from '@/assets/icons/homeIcon.svg?react';
import { SmileIcon } from 'lucide-react';

// Local Imports - Hooks
import { useHeader } from './HeaderContext';

// Local Imports - Components
import LocalComponent from './LocalComponent';

import styles from './Component.module.scss';
```

## Additional Rules

1. **Within each group**, maintain alphabetical order when practical
2. **Always add a blank line** between different import groups
3. **Destructured imports** should be organized alphabetically within the braces
4. **Type-only imports** should use the `import type` syntax when applicable
5. **Style imports** (.scss, .module.scss) should be on a separate line within the Local Imports section
6. **Side-effect imports** should go in the Local Imports section

## Special Cases

### Type-only Imports
When importing only TypeScript types, use the `type` keyword:
```typescript
import type { ButtonProps } from './Button.types';
```

### Mixed Imports
When importing both values and types from the same module:
```typescript
import { Statement, type StatementType } from 'delib-npm';
```

### Index Exports
When importing from an index file, treat it based on its path:
- If it's a component: Group 6 (Components)
- If it's a utility: Group 5 (Internal Absolute Imports)
- If it's local: Group 8 (Local Imports)

## Benefits

Following this organization provides:
- **Predictability**: Developers know where to find specific imports
- **Maintainability**: Easy to add, remove, or update imports
- **Readability**: Clear visual separation between different types of dependencies
- **Consistency**: All files follow the same pattern
- **Reduced merge conflicts**: Organized imports minimize git conflicts

## Enforcement

To maintain these standards:
1. Review imports during code reviews
2. Consider adding an ESLint rule for import ordering (eslint-plugin-import)
3. Use this document as a reference when refactoring existing files
4. Apply these rules to all new TSX files

## Quick Reference

1. React Core
2. Third-party Libraries
3. NPM Packages (delib-npm)
4. Redux Store
5. Database (@/controllers/db)
6. Internal Absolute Imports (@/)
7. App Hooks (@/controllers/hooks)
8. Components (@/view/components)
9. Icons (SVG assets, icon libraries)
10. Local Imports (relative, styles)

---

*Last updated: January 2025*