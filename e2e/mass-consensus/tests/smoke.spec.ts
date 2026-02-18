/**
 * Smoke test for the Mass Consensus app.
 * Verifies that the app loads and key elements are present.
 */
import { test, expect } from '@playwright/test';

test.describe('Mass Consensus App Smoke Tests', () => {
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

    // The body should have visible content rendered by the app
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    // Wait for any dynamic content to load
    await page.waitForTimeout(2000);

    // The page should have meaningful content (not just empty shell)
    const textContent = await page.textContent('body');
    expect(textContent!.trim().length).toBeGreaterThan(0);
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
