# /test - Comprehensive Testing Skill

Run tests for one or more apps in the Freedi monorepo. Supports unit tests, type checking, linting, and E2E tests.

## Determine Scope

First, ask the user which app(s) to test if not specified:
- **main** - Main Freedi app (root `src/`)
- **functions** - Firebase Cloud Functions (`functions/`)
- **mc** - Mass Consensus app (`apps/mass-consensus/`)
- **sign** - Sign app (`apps/sign/`)
- **flow** - Flow app (`apps/flow/`)
- **all** - Run everything

Also ask which checks to run (default: all):
- **unit** - Unit tests (Jest/Vitest depending on app)
- **typecheck** - TypeScript type checking
- **lint** - ESLint
- **e2e** - End-to-end tests (Playwright)
- **all** - All of the above

## Commands by App

### Main App (root)
| Check     | Command                                           |
|-----------|---------------------------------------------------|
| Unit      | `npm test`                                        |
| Unit (specific) | `npm test -- -t 'test name'`               |
| Unit (watch) | `npm run test:watch`                           |
| Coverage  | `npm run test:coverage`                           |
| Typecheck | `npm run typecheck`                               |
| Lint      | `npm run lint`                                    |
| Lint fix  | `npm run lint:fix`                                |
| E2E       | `npm run e2e:main`                                |
| E2E (UI)  | `npm run e2e:main:ui`                             |
| All       | `npm run check-all` (lint + typecheck + test + build) |

### Functions
| Check     | Command                                           |
|-----------|---------------------------------------------------|
| Unit      | `cd functions && npm test`                        |
| Unit (specific) | `cd functions && npm test -- -t 'test name'` |
| Unit (watch) | `cd functions && npm run test:watch`           |
| Typecheck | `cd functions && npx tsc --noEmit`                |
| Lint      | Included in root lint (covers `functions/src/**/*.ts`) |

### Mass Consensus (mc)
| Check     | Command                                           |
|-----------|---------------------------------------------------|
| Unit      | `cd apps/mass-consensus && npx jest`              |
| Unit (watch) | `cd apps/mass-consensus && npx jest --watch`   |
| Coverage  | `cd apps/mass-consensus && npx jest --coverage`   |
| Typecheck | `cd apps/mass-consensus && npx tsc --noEmit`      |
| Lint      | `cd apps/mass-consensus && npx eslint "src/**/*.{ts,tsx}"` |
| E2E       | `npm run e2e:mc`                                  |
| E2E (UI)  | `npm run e2e:mc:ui`                               |

### Sign App
| Check     | Command                                           |
|-----------|---------------------------------------------------|
| Unit      | `cd apps/sign && npx jest`                        |
| Unit (watch) | `cd apps/sign && npx jest --watch`             |
| Coverage  | `cd apps/sign && npx jest --coverage`             |
| Typecheck | `cd apps/sign && npx tsc --noEmit`                |
| Lint      | `cd apps/sign && npx eslint "src/**/*.{ts,tsx}"`  |
| E2E       | `npm run e2e:sign`                                |
| E2E (UI)  | `npm run e2e:sign:ui`                             |

### Bot App
| Check     | Command                                           |
|-----------|---------------------------------------------------|
| Unit      | `cd apps/flow && npm test` (Vitest)                |
| Unit (watch) | `cd apps/flow && npm run test:watch`            |
| Typecheck | `cd apps/flow && npm run typecheck`                |
| Lint      | `cd apps/flow && npm run lint`                     |
| All       | `cd apps/flow && npm run check-all` (lint + typecheck + build) |

**Note:** Flow app uses **Vitest** (not Jest). Test syntax is the same but use `vi` instead of `jest` for mocking:
```typescript
import { vi, describe, it, expect } from 'vitest';
vi.fn();       // instead of jest.fn()
vi.mock();     // instead of jest.mock()
vi.clearAllMocks(); // instead of jest.clearAllMocks()
```

## Execution Flow

1. Determine which app(s) and which checks from the user's request
2. Run the checks in this order: **lint -> typecheck -> unit tests -> e2e**
   - Stop early if a check fails (unless user says to continue)
3. For each failing check:
   - Analyze the error output
   - Fix the issue if it's in code I wrote or modified
   - Re-run the failing check to verify the fix
4. Report a summary at the end

## Writing New Unit Tests

When asked to create tests for a file:

1. Read the source file first to understand the code
2. Create test file at `__tests__/fileName.test.ts` (or `.test.tsx` for components) next to the source file
3. Follow these patterns:
   - Import from the source file
   - Use `describe` blocks grouped by function/feature
   - Use `beforeEach` for setup, `afterEach` for cleanup
   - Test happy paths, error cases, and edge cases
   - Mock external dependencies (Firebase, Redux, etc.)
   - Use meaningful test names that describe expected behavior
4. Run the test to make sure it passes

### Test file template:
```typescript
import { functionName } from '../sourceFile';

describe('functionName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle the basic case', () => {
    const result = functionName(input);
    expect(result).toBe(expected);
  });

  it('should handle error case', () => {
    expect(() => functionName(invalidInput)).toThrow();
  });
});
```

## E2E Test Notes

- Framework: Playwright (chromium only)
- Config files: `e2e/{main-app,sign-app,mass-consensus}/playwright.config.ts`
- Shared utilities: `packages/e2e-shared/`
- NEVER use `networkidle` wait - Firebase keeps persistent connections, causes crashes. Use `domcontentloaded`.
- Ports: main=5173, sign=3002, mc=3001, auth emulator=9099, firestore emulator=8081
- Install browsers first if needed: `npm run e2e:install`

## Coverage Thresholds

- **Main app utilities**: 80%+ coverage required
- **Mass Consensus**: 70% global threshold
- **Sign app**: 50% global, 80% for `src/lib/utils/*.ts`
- **Functions**: No hard threshold, but aim for good coverage
- **Bot**: No hard threshold, uses Vitest
