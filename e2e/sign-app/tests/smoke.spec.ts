/**
 * Smoke test for the Sign app.
 * Verifies that the app loads and key elements are present.
 */
import { test, expect } from '@playwright/test';

test.describe('Sign App Smoke Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Page should not show an error
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    // Should have a title
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('page renders app content', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // The sign app shows "Freedi Sign" heading on the login page
    const heading = page.getByRole('heading', { name: /freedi sign/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('no uncaught exceptions on load', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Wait a moment for any async errors
    await page.waitForTimeout(2000);

    expect(pageErrors).toHaveLength(0);
  });
});
