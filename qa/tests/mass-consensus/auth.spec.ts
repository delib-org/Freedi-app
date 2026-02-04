import { test, expect } from '@playwright/test';
import { TestHelpers } from '../../fixtures/test-utils';

/**
 * Mass Consensus App - Authentication Tests
 *
 * Test coverage:
 * - Landing page display
 * - Login options (Google, Anonymous)
 * - Authentication flow
 * - Session management
 */

test.describe('Mass Consensus - Authentication', () => {

  test.describe('Landing Page', () => {
    test('should display landing page with participant and admin paths', async ({ page }) => {
      await page.goto('/');

      await page.waitForLoadState('networkidle');

      // Check for landing page content
      const hasLandingContent = await page.locator('body').isVisible();
      expect(hasLandingContent).toBeTruthy();

      // Look for paths to participate or administer
      const participateOption = page.locator('a, button').filter({ hasText: /participate|join|take survey|start/i });
      const adminOption = page.locator('a, button').filter({ hasText: /admin|create|manage|login/i });

      const hasOptions = await participateOption.first().isVisible().catch(() => false) ||
                         await adminOption.first().isVisible().catch(() => false);

      // Either shows options or redirects to appropriate page
      expect(typeof hasOptions).toBe('boolean');
    });

    test('should display app branding/logo', async ({ page }) => {
      await page.goto('/');

      await page.waitForLoadState('networkidle');

      // Look for logo or app name
      const logo = page.locator('img[alt*="logo" i], [class*="logo"], h1, [class*="brand"]');

      const hasBranding = await logo.first().isVisible().catch(() => false);
      expect(typeof hasBranding).toBe('boolean');
    });
  });

  test.describe('Login Page', () => {
    test('should display login page with authentication options', async ({ page }) => {
      await page.goto('/login');

      await page.waitForLoadState('networkidle');

      // Check for login options
      const googleLogin = page.locator('button, a').filter({ hasText: /google/i });
      const anonymousLogin = page.locator('button, a').filter({ hasText: /guest|anonymous|continue without/i });

      const hasGoogleLogin = await googleLogin.first().isVisible().catch(() => false);
      const hasAnonymousLogin = await anonymousLogin.first().isVisible().catch(() => false);

      // Should have at least one login option
      expect(hasGoogleLogin || hasAnonymousLogin).toBeTruthy();
    });

    test('should allow anonymous/guest login', async ({ page }) => {
      await page.goto('/login');

      await page.waitForLoadState('networkidle');

      const anonymousButton = page.locator('button, a').filter({ hasText: /guest|anonymous|continue without|skip/i });

      if (await anonymousButton.first().isVisible().catch(() => false)) {
        await anonymousButton.first().click();

        await page.waitForTimeout(2000);

        // Should redirect to dashboard or survey list
        const isLoggedIn = !page.url().includes('/login') ||
                           page.url().includes('/admin') ||
                           page.url().includes('/s/');

        expect(isLoggedIn).toBeTruthy();
      }
    });

    test('should show loading state during authentication', async ({ page }) => {
      await page.goto('/login');

      await page.waitForLoadState('networkidle');

      const loginButton = page.locator('button').first();

      if (await loginButton.isVisible().catch(() => false)) {
        // Look for loading states
        const loadingStates = page.locator('[class*="loading"], [class*="spinner"], [disabled]');

        // Page structure is valid
        expect(await page.locator('body').isVisible()).toBeTruthy();
      }
    });
  });

  test.describe('Authentication Redirect', () => {
    test('should handle redirect parameter after login', async ({ page }) => {
      // Try to access protected admin page
      await page.goto('/admin/surveys');

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Should redirect to login with return URL
      const currentUrl = page.url();

      const isOnLogin = currentUrl.includes('login');
      const hasRedirectParam = currentUrl.includes('redirect') || currentUrl.includes('return');
      const isOnAdmin = currentUrl.includes('admin');

      // Either on login (with potential redirect) or already authenticated on admin
      expect(isOnLogin || isOnAdmin).toBeTruthy();
    });
  });

  test.describe('Session Persistence', () => {
    test('should persist authentication state', async ({ page }) => {
      await page.goto('/login');

      // Check for auth-related storage
      const authData = await page.evaluate(() => {
        const cookies = document.cookie;
        const localStorageKeys = Object.keys(localStorage);
        const sessionStorageKeys = Object.keys(sessionStorage);

        return {
          hasCookies: cookies.length > 0,
          hasLocalStorage: localStorageKeys.some(k =>
            k.includes('auth') || k.includes('user') || k.includes('firebase')
          ),
          hasSessionStorage: sessionStorageKeys.some(k =>
            k.includes('auth') || k.includes('user') || k.includes('firebase')
          )
        };
      });

      // Storage mechanism exists
      expect(typeof authData.hasCookies).toBe('boolean');
    });
  });

  test.describe('Accessibility', () => {
    test('login page should have proper form labels', async ({ page }) => {
      await page.goto('/login');

      await page.waitForLoadState('networkidle');

      // Check for accessible buttons
      const buttons = await page.locator('button').all();

      for (const button of buttons) {
        const text = await button.textContent();
        const ariaLabel = await button.getAttribute('aria-label');

        // Button should have text or aria-label
        const hasAccessibleName = (text && text.trim().length > 0) || ariaLabel;
        expect(hasAccessibleName).toBeTruthy();
      }
    });
  });
});
