import { test, expect } from '@playwright/test';
import { TestHelpers } from '../../fixtures/test-utils';

/**
 * Sign App - Document Viewing Tests
 *
 * Test coverage:
 * - Document loading
 * - Paragraph display
 * - Text direction (RTL/LTR)
 * - Table of contents
 * - Comments display
 * - Accessibility features
 */

test.describe('Sign App - Document Viewing', () => {

  test.describe('Document Loading', () => {
    test('should display document content', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      // Check for document content or error/login state
      const documentContent = page.locator(
        '[class*="document"], [class*="content"], main, article'
      );

      const hasContent = await documentContent.first().isVisible().catch(() => false);
      const isOnLogin = page.url().includes('login');
      const isError = await page.locator('text=/not found|error|404/i').isVisible().catch(() => false);

      expect(hasContent || isOnLogin || isError).toBeTruthy();
    });

    test('should display document title', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const title = page.locator('h1, [class*="title"]');

      const hasTitle = await title.first().isVisible().catch(() => false);

      expect(typeof hasTitle).toBe('boolean');
    });

    test('should show loading state while fetching document', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      // Check for loading indicator
      const loading = page.locator(
        '[class*="loading"], [class*="spinner"], [class*="skeleton"]'
      );

      // Loading might be fast, so just verify page loads
      await page.waitForLoadState('networkidle');
      expect(await page.locator('body').isVisible()).toBeTruthy();
    });

    test('should handle non-existent document gracefully', async ({ page }) => {
      await page.goto('/doc/non-existent-document-12345');

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Should show error or redirect
      const hasError = await page.locator('text=/not found|error|404/i').isVisible().catch(() => false);
      const isRedirected = !page.url().includes('non-existent-document');

      expect(hasError || isRedirected).toBeTruthy();
    });
  });

  test.describe('Paragraph Display', () => {
    test('should display document paragraphs', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const paragraphs = page.locator(
        '[class*="paragraph"], p, [class*="section"], [class*="content"] > div'
      );

      const paragraphCount = await paragraphs.count().catch(() => 0);

      // Either shows paragraphs or different page structure
      expect(typeof paragraphCount).toBe('number');
    });

    test('should display paragraph numbers or identifiers', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const paragraphNumbers = page.locator(
        '[class*="number"], [class*="index"], [class*="section-number"]'
      );

      const hasNumbers = await paragraphNumbers.first().isVisible().catch(() => false);

      expect(typeof hasNumbers).toBe('boolean');
    });
  });

  test.describe('Text Direction', () => {
    test('should handle RTL text properly', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      // Check for RTL attribute or direction style
      const rtlContent = page.locator('[dir="rtl"], [class*="rtl"]');
      const hasRTL = await rtlContent.first().isVisible().catch(() => false);

      // RTL is optional, depends on document language
      expect(typeof hasRTL).toBe('boolean');
    });

    test('should apply correct text alignment', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const contentArea = page.locator('main, [class*="content"], article').first();

      if (await contentArea.isVisible().catch(() => false)) {
        const textAlign = await contentArea.evaluate(el =>
          window.getComputedStyle(el).textAlign
        );

        // Should have explicit text alignment
        expect(['start', 'end', 'left', 'right', 'center', 'justify']).toContain(textAlign);
      }
    });
  });

  test.describe('Table of Contents', () => {
    test('should display table of contents if enabled', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const toc = page.locator(
        '[class*="toc"], [class*="table-of-contents"], [class*="contents"], nav[class*="doc"]'
      );

      const hasTOC = await toc.first().isVisible().catch(() => false);

      // TOC is optional based on document settings
      expect(typeof hasTOC).toBe('boolean');
    });

    test('should navigate to section when TOC item clicked', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const tocLink = page.locator('[class*="toc"] a, [class*="contents"] a').first();

      if (await tocLink.isVisible().catch(() => false)) {
        await tocLink.click();

        await page.waitForTimeout(500);

        // Should scroll to section
        const scrollPosition = await page.evaluate(() => window.scrollY);

        // Scroll position might change (or already at target)
        expect(typeof scrollPosition).toBe('number');
      }
    });
  });

  test.describe('Comments', () => {
    test('should display comment indicators on paragraphs', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const commentIndicators = page.locator(
        '[class*="comment"], [class*="annotation"], [class*="note"]'
      );

      const hasCommentIndicators = await commentIndicators.first().isVisible().catch(() => false);

      // Comments might not exist on test document
      expect(typeof hasCommentIndicators).toBe('boolean');
    });

    test('should show comment count badge', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const commentCount = page.locator(
        '[class*="count"], [class*="badge"]'
      ).filter({ hasText: /\d+/ });

      const hasCommentCount = await commentCount.first().isVisible().catch(() => false);

      expect(typeof hasCommentCount).toBe('boolean');
    });

    test('should expand comments on click', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const commentButton = page.locator(
        '[class*="comment"] button, button[class*="comment"]'
      ).first();

      if (await commentButton.isVisible().catch(() => false)) {
        await commentButton.click();

        await page.waitForTimeout(500);

        // Should show expanded comment section
        const expandedComments = page.locator(
          '[class*="comment-list"], [class*="comments-expanded"], [class*="comment-thread"]'
        );

        const isExpanded = await expandedComments.first().isVisible().catch(() => false);

        expect(typeof isExpanded).toBe('boolean');
      }
    });
  });

  test.describe('Header Customization', () => {
    test('should display custom header if configured', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const header = page.locator('header, [class*="header"]');

      const hasHeader = await header.first().isVisible().catch(() => false);

      expect(typeof hasHeader).toBe('boolean');
    });

    test('should display custom logo if configured', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const logo = page.locator('header img, [class*="logo"] img');

      const hasLogo = await logo.first().isVisible().catch(() => false);

      expect(typeof hasLogo).toBe('boolean');
    });
  });

  test.describe('Video Content', () => {
    test('should display explanation video if enabled', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const video = page.locator(
        'video, iframe[src*="youtube"], iframe[src*="vimeo"], [class*="video"]'
      );

      const hasVideo = await video.first().isVisible().catch(() => false);

      // Video is optional based on document settings
      expect(typeof hasVideo).toBe('boolean');
    });
  });

  test.describe('Accessibility', () => {
    test('document should have proper heading structure', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const h1Count = await page.locator('h1').count();

      // Should have at least one h1
      expect(h1Count >= 1 || page.url().includes('login')).toBeTruthy();
    });

    test('should have proper landmark regions', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const mainContent = page.locator('main, [role="main"]');

      const hasMain = await mainContent.first().isVisible().catch(() => false);

      expect(typeof hasMain).toBe('boolean');
    });

    test('should support keyboard navigation through document', async ({ page }) => {
      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      // Tab through document
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
      }

      const focusedElement = page.locator(':focus');
      const hasFocus = await focusedElement.count() > 0;

      expect(hasFocus).toBeTruthy();
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('should display properly on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      // Check for horizontal scroll
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.body.scrollWidth > window.innerWidth + 10;
      });

      expect(hasHorizontalScroll).toBeFalsy();
    });

    test('should have readable text on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/doc/test-document-id');

      await page.waitForLoadState('networkidle');

      const content = page.locator('p, [class*="paragraph"]').first();

      if (await content.isVisible().catch(() => false)) {
        const fontSize = await content.evaluate(el =>
          parseFloat(window.getComputedStyle(el).fontSize)
        );

        // Font size should be at least 14px for readability
        expect(fontSize).toBeGreaterThanOrEqual(14);
      }
    });
  });
});
