# Freedi App Development Guide

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
- **TypeScript**: Strict typing - no `any` allowed
- **React**: Functional components with hooks
- **Imports**: Add newline after imports
- **Formatting**: No multiple empty lines, newline before return
- **Naming**: camelCase for variables/functions, PascalCase for components/classes
- **Error handling**: Use try/catch for async operations
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
- **Valibot validation**: All timestamp fields must be `z.number()` or `z.ZodNumber`