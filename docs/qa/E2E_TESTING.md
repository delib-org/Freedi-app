# E2E Testing with Playwright

## Overview

The project uses Playwright for end-to-end testing across all three apps. Each app has its own config and test directory under `e2e/`. Shared utilities live in `packages/e2e-shared/`.

```
e2e/
  main-app/           # Vite/React app (port 5173)
  sign-app/           # Next.js (port 3002)
  mass-consensus/     # Next.js (port 3001)

packages/e2e-shared/  # Shared helpers, fixtures, page objects
```

## Commands

```bash
# Run tests
npm run e2e:main        # Main app
npm run e2e:sign        # Sign app
npm run e2e:mc          # MC app

# Interactive UI mode (best for writing/debugging tests)
npm run e2e:main:ui
npm run e2e:sign:ui
npm run e2e:mc:ui

# Run a single spec file
npx playwright test --config=e2e/main-app/playwright.config.ts tests/my-feature.spec.ts

# Install browser binaries (first-time setup)
npm run e2e:install
```

## Prerequisites

Tests need the dev server running for the target app. Playwright will auto-start it via the `webServer` config, but if you already have it running, it reuses the existing server (faster).

For tests that use Firebase, the emulators must be running:
```bash
npm run deve   # starts emulators + main app
```

## Writing Tests for a New Feature

### 1. Create a spec file

Place it in the relevant app's test directory:

```
e2e/main-app/tests/my-feature.spec.ts
e2e/sign-app/tests/my-feature.spec.ts
e2e/mass-consensus/tests/my-feature.spec.ts
```

### 2. Basic test structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('My Feature', () => {
  test('user can do the thing', async ({ page }) => {
    await page.goto('/some-route');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

### 3. Tests that need authentication

Use the shared fixtures from `@freedi/e2e-shared`:

```typescript
import { test, expect } from '@freedi/e2e-shared';

test('logged-in user can create a statement', async ({ page, testUser }) => {
  // testUser is already created in the Firebase Auth Emulator
  // testUser has: email, password, displayName, localId, idToken
});
```

### 4. Tests that need seeded data

```typescript
import { test, expect } from '@playwright/test';
import { seedDocument, clearFirestoreData } from '@freedi/e2e-shared';

test.beforeEach(async () => {
  await clearFirestoreData();
  await seedDocument({
    collection: 'statements',
    id: 'test-statement-1',
    data: {
      statement: 'Test question',
      statementType: 'question',
      createdAt: Date.now(),
      lastUpdate: Date.now(),
    },
  });
});

test('displays the seeded statement', async ({ page }) => {
  await page.goto('/statement/test-statement-1');
  await expect(page.getByText('Test question')).toBeVisible();
});
```

### 5. Cleaning up between tests

```typescript
import { clearFirestoreData, clearEmulatorUsers } from '@freedi/e2e-shared';

test.afterAll(async () => {
  await clearFirestoreData();
  await clearEmulatorUsers();
});
```

## Shared Utilities Reference (`@freedi/e2e-shared`)

### Auth helpers (`firebase-auth.helper.ts`)

| Function | Description |
|----------|-------------|
| `createEmulatorUser({ email, password, displayName })` | Create a user in Auth Emulator |
| `signInEmulatorUser(email, password)` | Sign in an existing user |
| `clearEmulatorUsers()` | Delete all users from emulator |
| `TEST_USER` | Default test user credentials |

### Firestore helpers (`firebase-seed.helper.ts`)

| Function | Description |
|----------|-------------|
| `seedDocument({ collection, id, data })` | Insert a document into emulator |
| `seedDocuments(docs)` | Insert multiple documents |
| `clearFirestoreData()` | Delete all Firestore emulator data |

### Fixtures (`base.fixture.ts`)

Import `test` from `@freedi/e2e-shared` instead of `@playwright/test` to get:
- `testUser` - a user auto-created in the Auth Emulator

### Page objects (`base.page.ts`)

```typescript
import { BasePage } from '@freedi/e2e-shared';

class MyFeaturePage extends BasePage {
  async submitForm(text: string) {
    await this.page.getByRole('textbox').fill(text);
    await this.page.getByRole('button', { name: 'Submit' }).click();
  }
}
```

## Best Practices

- **Use role-based locators**: `getByRole`, `getByText`, `getByLabel` instead of CSS selectors. They survive refactors.
- **Avoid `networkidle`**: Firebase apps keep persistent connections. Use `domcontentloaded` instead.
- **One spec file per feature**: Keeps tests focused and lets you run features independently.
- **Clean up in `afterAll`**: Clear seeded data so tests don't leak state.
- **Use UI mode for development**: `npm run e2e:main:ui` gives you a live browser, locator picker, and re-run on save.

## Emulator Ports

| Service    | Port |
|------------|------|
| Auth       | 9099 |
| Firestore  | 8081 |
| Storage    | 9199 |
| Functions  | 5001 |
| Emulator UI| 5002 |

## File Locations

| File | Purpose |
|------|---------|
| `e2e/main-app/playwright.config.ts` | Main app Playwright config |
| `e2e/sign-app/playwright.config.ts` | Sign app Playwright config |
| `e2e/mass-consensus/playwright.config.ts` | MC app Playwright config |
| `packages/e2e-shared/src/helpers/firebase-auth.helper.ts` | Auth emulator helpers |
| `packages/e2e-shared/src/helpers/firebase-seed.helper.ts` | Firestore seed/clear helpers |
| `packages/e2e-shared/src/fixtures/base.fixture.ts` | Extended test fixtures |
| `packages/e2e-shared/src/page-objects/base.page.ts` | Base page object |
