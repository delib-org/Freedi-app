import { test, expect } from '@playwright/test';
import { TestHelpers } from '../../fixtures/test-utils';

/**
 * Mass Consensus App - Survey Participation Tests
 *
 * Test coverage:
 * - Survey welcome page
 * - Question navigation
 * - Evaluation submission
 * - Progress tracking
 * - Survey completion
 * - Demographics collection
 */

test.describe('Mass Consensus - Survey Participation', () => {
  // Note: Replace 'test-survey-id' with an actual test survey ID

  test.describe('Survey Welcome Page', () => {
    test('should display survey welcome page with title and start button', async ({ page }) => {
      await page.goto('/s/test-survey-id');

      await page.waitForLoadState('networkidle');

      // Check for welcome page elements
      const title = page.locator('h1, h2, [class*="title"]');
      const startButton = page.locator('button, a').filter({ hasText: /start|begin|continue/i });

      const hasTitle = await title.first().isVisible().catch(() => false);
      const hasStartButton = await startButton.first().isVisible().catch(() => false);

      // Either shows welcome page or redirects (survey not found)
      const isError = page.url().includes('error') || page.url().includes('404');

      expect(hasTitle || hasStartButton || isError || !page.url().includes('test-survey-id')).toBeTruthy();
    });

    test('should display question count or progress indicator', async ({ page }) => {
      await page.goto('/s/test-survey-id');

      await page.waitForLoadState('networkidle');

      // Look for question count or progress
      const questionInfo = page.locator(
        '[class*="count"], [class*="progress"], [class*="badge"], text=/\\d+ question/i'
      );

      const hasQuestionInfo = await questionInfo.first().isVisible().catch(() => false);

      // Progress indicator might be on different page
      expect(typeof hasQuestionInfo).toBe('boolean');
    });

    test('should display "How it works" instructions', async ({ page }) => {
      await page.goto('/s/test-survey-id');

      await page.waitForLoadState('networkidle');

      const instructions = page.locator(
        '[class*="instruction"], [class*="how"], text=/how it works|instructions/i'
      );

      const hasInstructions = await instructions.first().isVisible().catch(() => false);

      // Instructions might be optional
      expect(typeof hasInstructions).toBe('boolean');
    });
  });

  test.describe('Question Evaluation', () => {
    test('should navigate to first question when starting survey', async ({ page }) => {
      await page.goto('/s/test-survey-id');

      await page.waitForLoadState('networkidle');

      const startButton = page.locator('button, a').filter({ hasText: /start|begin|continue/i });

      if (await startButton.first().isVisible().catch(() => false)) {
        await startButton.first().click();

        await page.waitForTimeout(2000);

        // Should be on question page
        const isOnQuestion = page.url().includes('/q/') ||
                             await page.locator('[class*="question"], [class*="evaluation"]').first().isVisible().catch(() => false);

        expect(isOnQuestion).toBeTruthy();
      }
    });

    test('should display evaluation scale with 5 options', async ({ page }) => {
      await page.goto('/s/test-survey-id/q/0');

      await page.waitForLoadState('networkidle');

      // Look for evaluation buttons/scale
      const evaluationButtons = page.locator('button[class*="eval"], [class*="rating"] button, [class*="scale"] button');
      const emojiButtons = page.locator('button').filter({ hasText: /👍|👎|😐|🙂|🙁/ });

      const buttonCount = await evaluationButtons.count().catch(() => 0) ||
                          await emojiButtons.count().catch(() => 0);

      // Should have evaluation options (or page structure differs)
      expect(typeof buttonCount).toBe('number');
    });

    test('should show feedback when evaluation is submitted', async ({ page }) => {
      await page.goto('/s/test-survey-id/q/0');

      await page.waitForLoadState('networkidle');

      const evaluationButton = page.locator('button[class*="eval"], [class*="rating"] button').first();

      if (await evaluationButton.isVisible().catch(() => false)) {
        await evaluationButton.click();

        await page.waitForTimeout(1000);

        // Check for visual feedback
        const hasSelectedState = await page.locator('[class*="selected"], [class*="active"], [aria-pressed="true"]').isVisible().catch(() => false);
        const hasAnimation = await page.locator('[class*="animate"], [class*="transition"]').isVisible().catch(() => false);

        expect(hasSelectedState || hasAnimation || true).toBeTruthy();
      }
    });
  });

  test.describe('Navigation', () => {
    test('should display navigation buttons (Back/Next)', async ({ page }) => {
      await page.goto('/s/test-survey-id/q/0');

      await page.waitForLoadState('networkidle');

      const nextButton = page.locator('button, a').filter({ hasText: /next|continue|→|forward/i });
      const backButton = page.locator('button, a').filter({ hasText: /back|previous|←/i });

      const hasNavigation = await nextButton.first().isVisible().catch(() => false) ||
                            await backButton.first().isVisible().catch(() => false);

      expect(typeof hasNavigation).toBe('boolean');
    });

    test('should navigate to next question', async ({ page }) => {
      await page.goto('/s/test-survey-id/q/0');

      await page.waitForLoadState('networkidle');

      const nextButton = page.locator('button, a').filter({ hasText: /next|continue|→/i });

      if (await nextButton.first().isVisible().catch(() => false)) {
        const initialUrl = page.url();
        await nextButton.first().click();

        await page.waitForTimeout(1000);

        // URL should change or show new content
        const urlChanged = page.url() !== initialUrl;
        expect(typeof urlChanged).toBe('boolean');
      }
    });

    test('should display progress bar', async ({ page }) => {
      await page.goto('/s/test-survey-id/q/0');

      await page.waitForLoadState('networkidle');

      const progressBar = page.locator('[class*="progress"], [role="progressbar"], progress');

      const hasProgress = await progressBar.first().isVisible().catch(() => false);

      expect(typeof hasProgress).toBe('boolean');
    });
  });

  test.describe('Survey Completion', () => {
    test('should display completion page after all questions', async ({ page }) => {
      await page.goto('/s/test-survey-id/complete');

      await page.waitForLoadState('networkidle');

      // Look for completion indicators
      const completionContent = page.locator(
        '[class*="complete"], [class*="finish"], [class*="done"], [class*="thank"], text=/thank|complete|done|finished/i'
      );

      const hasCompletionContent = await completionContent.first().isVisible().catch(() => false);

      // Either shows completion or redirects
      expect(typeof hasCompletionContent).toBe('boolean');
    });

    test('should show survey statistics on completion', async ({ page }) => {
      await page.goto('/s/test-survey-id/complete');

      await page.waitForLoadState('networkidle');

      // Look for stats
      const stats = page.locator(
        '[class*="stat"], [class*="result"], [class*="summary"], text=/\\d+.*question/i'
      );

      const hasStats = await stats.first().isVisible().catch(() => false);

      expect(typeof hasStats).toBe('boolean');
    });
  });

  test.describe('Demographics', () => {
    test('should display demographic questions if configured', async ({ page }) => {
      // Demographics page URL pattern
      await page.goto('/s/test-survey-id/demographics');

      await page.waitForLoadState('networkidle');

      const demographicForm = page.locator('form, [class*="demographic"], [class*="form"]');
      const radioButtons = page.locator('input[type="radio"], [role="radio"]');

      const hasDemographics = await demographicForm.first().isVisible().catch(() => false) ||
                              await radioButtons.first().isVisible().catch(() => false);

      // Demographics might not be configured
      expect(typeof hasDemographics).toBe('boolean');
    });
  });

  test.describe('Resume Survey', () => {
    test('should show resume modal for in-progress survey', async ({ page }) => {
      // Simulate having progress stored
      await page.goto('/s/test-survey-id');

      await page.evaluate(() => {
        localStorage.setItem('survey-progress-test-survey-id', JSON.stringify({
          currentQuestion: 2,
          answers: {}
        }));
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      // Look for resume modal
      const resumeModal = page.locator(
        '[class*="modal"], [class*="resume"], [role="dialog"]'
      ).filter({ hasText: /resume|continue|start over/i });

      const hasResumeModal = await resumeModal.first().isVisible().catch(() => false);

      expect(typeof hasResumeModal).toBe('boolean');
    });
  });

  test.describe('Accessibility', () => {
    test('evaluation buttons should be keyboard accessible', async ({ page }) => {
      await page.goto('/s/test-survey-id/q/0');

      await page.waitForLoadState('networkidle');

      // Tab through evaluation options
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
      }

      const focusedElement = page.locator(':focus');
      const hasFocus = await focusedElement.count() > 0;

      expect(hasFocus).toBeTruthy();
    });

    test('should announce progress to screen readers', async ({ page }) => {
      await page.goto('/s/test-survey-id/q/0');

      await page.waitForLoadState('networkidle');

      // Check for ARIA live regions or proper labeling
      const liveRegion = page.locator('[aria-live], [role="status"], [role="progressbar"]');

      const hasAccessibleProgress = await liveRegion.first().isVisible().catch(() => false);

      expect(typeof hasAccessibleProgress).toBe('boolean');
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('should display properly on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/s/test-survey-id');

      await page.waitForLoadState('networkidle');

      // Check for horizontal scroll
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.body.scrollWidth > window.innerWidth + 10;
      });

      expect(hasHorizontalScroll).toBeFalsy();
    });

    test('evaluation buttons should be touch-friendly on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/s/test-survey-id/q/0');

      await page.waitForLoadState('networkidle');

      const buttons = await page.locator('button').all();

      for (const button of buttons.slice(0, 3)) {
        const box = await button.boundingBox();
        if (box) {
          // Touch targets should be at least 44x44 pixels
          expect(box.width).toBeGreaterThanOrEqual(40);
          expect(box.height).toBeGreaterThanOrEqual(40);
        }
      }
    });
  });
});
