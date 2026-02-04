# Freedi QA Testing Suite

Automated E2E tests and manual QA checklists for all Freedi applications.

## Applications Covered

| App | Description | Local Port |
|-----|-------------|------------|
| **Freedi** | Main deliberative democracy platform | 5173 |
| **Mass Consensus** | Survey and consensus gathering | 3000 |
| **Sign** | Document signing and approval | 3001 |

## Quick Start

### 1. Install Dependencies

```bash
cd qa
npm install
npx playwright install
```

### 2. Start Applications

In separate terminals:

```bash
# Terminal 1 - Freedi (Main App)
npm run dev

# Terminal 2 - Mass Consensus
cd apps/mass-consensus && npm run dev

# Terminal 3 - Sign
cd apps/sign && npm run dev
```

### 3. Run Tests

```bash
# Run all tests (all apps, all browsers)
npm test

# Run tests for specific app
npm run test:freedi
npm run test:mc
npm run test:sign

# Run mobile tests
npm run test:mobile

# Run with visual UI
npm run test:ui

# Run in headed mode (see browser)
npm run test:headed

# Debug mode
npm run test:debug
```

### 4. View Reports

```bash
npm run report
```

## Test Structure

```
qa/
├── playwright.config.ts    # Playwright configuration
├── package.json           # QA dependencies
├── tsconfig.json          # TypeScript config
├── QA-CHECKLIST.md        # Manual testing checklist
├── README.md              # This file
├── fixtures/
│   └── test-utils.ts      # Shared test utilities
└── tests/
    ├── freedi/            # Freedi main app tests
    │   ├── auth.spec.ts
    │   ├── home.spec.ts
    │   └── statement.spec.ts
    ├── mass-consensus/    # Mass Consensus tests
    │   ├── auth.spec.ts
    │   ├── survey-participation.spec.ts
    │   └── admin.spec.ts
    └── sign/              # Sign app tests
        ├── auth.spec.ts
        ├── document.spec.ts
        ├── signing.spec.ts
        └── admin.spec.ts
```

## Configuration

### Environment Variables

Set these to test against different environments:

```bash
# Test against local development
export FREEDI_URL=http://localhost:5173
export MC_URL=http://localhost:3000
export SIGN_URL=http://localhost:3001

# Test against staging
export FREEDI_URL=https://staging.freedi.delib.org
export MC_URL=https://staging-mc.delib.org
export SIGN_URL=https://staging-sign.delib.org

# Test against production
export FREEDI_URL=https://freedi.delib.org
export MC_URL=https://mc.delib.org
export SIGN_URL=https://sign.delib.org
```

### Browser Configuration

Tests run on these browsers by default:
- Chromium (Desktop)
- Firefox (Desktop)
- iPhone 13 (Mobile)

Modify `playwright.config.ts` to add/remove browsers.

## Writing New Tests

### Test File Naming

- Use `.spec.ts` extension
- Name files by feature: `auth.spec.ts`, `navigation.spec.ts`
- Place in appropriate app folder

### Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { TestHelpers } from '../../fixtures/test-utils';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup before each test
  });

  test('should do something', async ({ page }) => {
    await page.goto('/path');
    await expect(page.locator('selector')).toBeVisible();
  });
});
```

### Using Test Helpers

```typescript
import { TestHelpers, TestData, A11yHelpers } from '../../fixtures/test-utils';

test('example', async ({ page }) => {
  const helpers = new TestHelpers(page);
  const a11y = new A11yHelpers(page);

  // Wait for page load
  await helpers.waitForPageLoad();

  // Generate test data
  const email = TestData.randomEmail();

  // Check accessibility
  await a11y.checkBasicA11y();
});
```

## Manual QA Checklist

See `QA-CHECKLIST.md` for comprehensive manual testing procedures covering:
- Authentication flows
- Core functionality
- Accessibility
- Mobile responsiveness
- Error handling
- Cross-browser compatibility

## Test Data Requirements

For automated tests to pass, ensure:

1. **Test Survey** exists with ID `test-survey-id`
2. **Test Document** exists with ID `test-document-id`
3. **Test User** has access to test data

### Creating Test Data

```bash
# Use Firebase console or run setup script
# (Setup script not yet implemented)
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
# Example GitHub Actions
qa-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - name: Install dependencies
      run: cd qa && npm ci
    - name: Install Playwright
      run: cd qa && npx playwright install --with-deps
    - name: Run tests
      run: cd qa && npm test
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report
        path: qa/test-results/
```

## Troubleshooting

### Tests failing to connect

Ensure applications are running:
```bash
# Check if ports are in use
lsof -i :5173
lsof -i :3000
lsof -i :3001
```

### Authentication tests failing

- Check if test accounts are configured
- Verify Firebase emulators are running (for local tests)
- Check for CORS issues

### Timeout errors

Increase timeout in `playwright.config.ts`:
```typescript
timeout: 60000,  // 60 seconds
```

### Flaky tests

- Add explicit waits: `await page.waitForLoadState('networkidle')`
- Use specific selectors
- Check for race conditions

## Contributing

1. Write tests for new features
2. Update `QA-CHECKLIST.md` for new functionality
3. Ensure all tests pass before PR
4. Add test data requirements to documentation

## Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Testing Library](https://testing-library.com/)
- [WCAG Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
