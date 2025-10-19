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