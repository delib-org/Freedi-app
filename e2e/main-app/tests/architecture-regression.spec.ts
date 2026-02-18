/**
 * Architecture Phase 1 - Regression Tests
 *
 * Verifies that the refactored modules (controller/view boundary fixes,
 * type relocations) don't break core app functionality.
 */
import { test, expect } from '@playwright/test';

test.describe('Architecture Phase 1 Regression', () => {
  test('app loads without import/module errors in console', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Filter out known non-critical errors (e.g. network errors from Firebase in test)
    const moduleErrors = consoleErrors.filter(
      (e) =>
        e.includes('Failed to resolve module') ||
        e.includes('Cannot find module') ||
        e.includes('is not defined') ||
        e.includes('import') && e.includes('error'),
    );
    expect(moduleErrors).toHaveLength(0);
  });

  test('vote-related pages render without errors (colorUtils refactor)', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // The app should load without JS errors from the refactored color utilities
    const importErrors = pageErrors.filter(
      (e) =>
        e.includes('colorUtils') ||
        e.includes('getRandomColor') ||
        e.includes('getSiblingOptionsByParentId') ||
        e.includes('getExistingOptionColors'),
    );
    expect(importErrors).toHaveLength(0);
  });

  test('evaluation-related code loads correctly (type relocation)', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // No errors from relocated EnhancedEvaluationThumb type
    const typeErrors = pageErrors.filter(
      (e) =>
        e.includes('EnhancedEvaluationThumb') ||
        e.includes('evaluation.ts') ||
        e.includes('demographics.ts'),
    );
    expect(typeErrors).toHaveLength(0);
  });

  test('no page errors from refactored modules on navigation', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // No errors related to refactored modules
    const refactorErrors = pageErrors.filter(
      (e) =>
        e.includes('colorUtils') ||
        e.includes('demographics') ||
        e.includes('evaluation') ||
        e.includes('MemberReviewData') ||
        e.includes('InheritedQuestion'),
    );
    expect(refactorErrors).toHaveLength(0);
  });
});
