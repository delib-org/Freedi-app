/**
 * Architecture Phase 1 - MC App Regression Tests
 *
 * Verifies that the surveys.ts split into modules doesn't break
 * the Mass Consensus app.
 */
import { test, expect } from '@playwright/test';

test.describe('MC App - surveys.ts Split Regression', () => {
  test('app loads without module resolution errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // No module resolution errors from the surveys split
    const moduleErrors = consoleErrors.filter(
      (e) =>
        e.includes('Failed to resolve module') ||
        e.includes('Cannot find module') ||
        e.includes('surveys'),
    );
    expect(moduleErrors).toHaveLength(0);
  });

  test('no uncaught exceptions after surveys module refactor', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Filter for survey-related errors specifically
    const surveyErrors = pageErrors.filter(
      (e) =>
        e.includes('survey') ||
        e.includes('Survey') ||
        e.includes('surveyCrud') ||
        e.includes('surveyHelpers'),
    );
    expect(surveyErrors).toHaveLength(0);
  });

  test('MC app renders content successfully', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    await page.waitForTimeout(1000);
    const textContent = await page.textContent('body');
    expect(textContent!.trim().length).toBeGreaterThan(0);
  });
});
