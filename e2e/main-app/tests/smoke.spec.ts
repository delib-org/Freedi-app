/**
 * Smoke test for the main Freedi app.
 * Verifies that the homepage loads and key elements are present.
 */
import { test, expect } from '@playwright/test';

test.describe('Main App Smoke Tests', () => {
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

  test('page does not show a blank screen', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // The root div should have content (React app mounted)
    const root = page.locator('#root');
    await expect(root).not.toBeEmpty();
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
