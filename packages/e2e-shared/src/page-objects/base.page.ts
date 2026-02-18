/**
 * Base page object with common patterns for Freedi E2E tests.
 */
import { type Page, type Locator, expect } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  /** Wait for the page to finish loading (network idle) */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /** Navigate to a path relative to baseURL */
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  /** Get page title */
  async getTitle(): Promise<string> {
    return this.page.title();
  }

  /** Check if an element is visible */
  async isVisible(selector: string): Promise<boolean> {
    return this.page.locator(selector).isVisible();
  }

  /** Wait for a selector to be visible */
  async waitForSelector(selector: string, timeout = 10000): Promise<Locator> {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout });
    return locator;
  }

  /** Take a screenshot for debugging */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/${name}.png` });
  }
}
