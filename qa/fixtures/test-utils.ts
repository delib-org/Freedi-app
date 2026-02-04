import { test as base, expect, Page } from '@playwright/test';

/**
 * Extended test utilities for Freedi QA testing
 */

// Custom test fixture with common utilities
export const test = base.extend<{
  authenticatedPage: Page;
}>({
  // Fixture for authenticated page (can be extended per app)
  authenticatedPage: async ({ page }, use) => {
    // This is a placeholder - actual auth would depend on the app
    await use(page);
  },
});

export { expect };

/**
 * Common test helpers
 */
export class TestHelpers {
  constructor(private page: Page) {}

  /**
   * Wait for page to be fully loaded
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for element to be visible with custom timeout
   */
  async waitForElement(selector: string, timeout = 10000): Promise<void> {
    await this.page.waitForSelector(selector, { state: 'visible', timeout });
  }

  /**
   * Check if element exists on page
   */
  async elementExists(selector: string): Promise<boolean> {
    const element = await this.page.$(selector);
    return element !== null;
  }

  /**
   * Get text content of element
   */
  async getTextContent(selector: string): Promise<string | null> {
    return this.page.textContent(selector);
  }

  /**
   * Take screenshot with descriptive name
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true
    });
  }

  /**
   * Scroll element into view
   */
  async scrollToElement(selector: string): Promise<void> {
    await this.page.locator(selector).scrollIntoViewIfNeeded();
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(url: string | RegExp): Promise<void> {
    await this.page.waitForURL(url);
  }

  /**
   * Click and wait for navigation
   */
  async clickAndNavigate(selector: string, expectedUrl: string | RegExp): Promise<void> {
    await Promise.all([
      this.page.waitForURL(expectedUrl),
      this.page.click(selector),
    ]);
  }

  /**
   * Fill form field
   */
  async fillField(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  /**
   * Select dropdown option
   */
  async selectOption(selector: string, value: string): Promise<void> {
    await this.page.selectOption(selector, value);
  }

  /**
   * Check checkbox
   */
  async checkCheckbox(selector: string): Promise<void> {
    await this.page.check(selector);
  }

  /**
   * Verify toast/notification message
   */
  async verifyToastMessage(expectedText: string): Promise<void> {
    const toast = this.page.locator('[role="alert"], .toast, .notification');
    await expect(toast).toContainText(expectedText);
  }

  /**
   * Verify page title
   */
  async verifyPageTitle(expectedTitle: string): Promise<void> {
    await expect(this.page).toHaveTitle(expectedTitle);
  }

  /**
   * Get all text from multiple elements
   */
  async getAllTextContent(selector: string): Promise<string[]> {
    const elements = await this.page.locator(selector).all();
    const texts: string[] = [];
    for (const element of elements) {
      const text = await element.textContent();
      if (text) texts.push(text.trim());
    }
    return texts;
  }

  /**
   * Wait for API response
   */
  async waitForAPIResponse(urlPattern: string | RegExp): Promise<void> {
    await this.page.waitForResponse(urlPattern);
  }

  /**
   * Mock Firebase authentication (for testing)
   */
  async mockFirebaseAuth(userId: string, email: string): Promise<void> {
    await this.page.evaluate(({ userId, email }) => {
      localStorage.setItem('firebase:authUser', JSON.stringify({
        uid: userId,
        email: email,
        displayName: 'Test User',
      }));
    }, { userId, email });
  }
}

/**
 * Test data generators
 */
export const TestData = {
  /**
   * Generate random email
   */
  randomEmail(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
  },

  /**
   * Generate random statement text
   */
  randomStatement(): string {
    const topics = [
      'We should improve public transportation',
      'Climate action is essential for our future',
      'Education funding should be increased',
      'Healthcare access needs to be expanded',
      'Technology can help solve social problems',
    ];
    return topics[Math.floor(Math.random() * topics.length)];
  },

  /**
   * Generate random survey title
   */
  randomSurveyTitle(): string {
    return `QA Test Survey ${Date.now()}`;
  },

  /**
   * Generate random document title
   */
  randomDocumentTitle(): string {
    return `QA Test Document ${Date.now()}`;
  },
};

/**
 * Accessibility testing helpers
 */
export class A11yHelpers {
  constructor(private page: Page) {}

  /**
   * Check for basic accessibility issues
   */
  async checkBasicA11y(): Promise<void> {
    // Check for images without alt text
    const imagesWithoutAlt = await this.page.locator('img:not([alt])').count();
    expect(imagesWithoutAlt).toBe(0);

    // Check for buttons without accessible names
    const buttonsWithoutName = await this.page.locator('button:not([aria-label]):not(:has-text(/./))').count();
    expect(buttonsWithoutName).toBe(0);

    // Check for form inputs without labels
    const inputsWithoutLabel = await this.page.locator('input:not([aria-label]):not([id])').count();
    expect(inputsWithoutLabel).toBe(0);
  }

  /**
   * Test keyboard navigation
   */
  async testKeyboardNavigation(expectedFocusOrder: string[]): Promise<void> {
    for (const selector of expectedFocusOrder) {
      await this.page.keyboard.press('Tab');
      const focusedElement = await this.page.locator(':focus');
      await expect(focusedElement).toHaveAttribute('data-testid', selector);
    }
  }

  /**
   * Check color contrast (basic check)
   */
  async checkFocusVisible(): Promise<void> {
    // Tab through elements and verify focus is visible
    await this.page.keyboard.press('Tab');
    const focusedElement = await this.page.locator(':focus');
    const outline = await focusedElement.evaluate(el =>
      window.getComputedStyle(el).outline
    );
    expect(outline).not.toBe('none');
  }
}

/**
 * Performance testing helpers
 */
export class PerformanceHelpers {
  constructor(private page: Page) {}

  /**
   * Measure page load time
   */
  async measureLoadTime(): Promise<number> {
    const startTime = Date.now();
    await this.page.waitForLoadState('networkidle');
    return Date.now() - startTime;
  }

  /**
   * Check if page loads within threshold
   */
  async assertLoadTimeUnder(maxMs: number): Promise<void> {
    const loadTime = await this.measureLoadTime();
    expect(loadTime).toBeLessThan(maxMs);
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(): Promise<Record<string, number>> {
    const metrics = await this.page.evaluate(() => {
      const performance = window.performance;
      const timing = performance.timing;
      return {
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        loadComplete: timing.loadEventEnd - timing.navigationStart,
        firstPaint: performance.getEntriesByType('paint')[0]?.startTime || 0,
      };
    });
    return metrics;
  }
}
