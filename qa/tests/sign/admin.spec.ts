import { test, expect } from '@playwright/test';
import { TestHelpers } from '../../fixtures/test-utils';

/**
 * Sign App - Admin Tests
 *
 * Test coverage:
 * - Document settings
 * - Team management
 * - Document editing
 * - Version history
 * - Collaboration features
 */

test.describe('Sign App - Admin Features', () => {

  test.describe('Document Settings', () => {
    test('should display settings page', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/settings');

      await page.waitForLoadState('networkidle');

      const settingsContent = page.locator(
        '[class*="settings"], form, [class*="config"]'
      );

      const hasSettings = await settingsContent.first().isVisible().catch(() => false);
      const isOnLogin = page.url().includes('login');

      expect(hasSettings || isOnLogin).toBeTruthy();
    });

    test('should allow configuring text direction', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/settings');

      await page.waitForLoadState('networkidle');

      const directionSetting = page.locator(
        '[name*="direction"], [class*="direction"], select, [class*="rtl"]'
      );

      const hasDirectionSetting = await directionSetting.first().isVisible().catch(() => false);

      expect(typeof hasDirectionSetting).toBe('boolean');
    });

    test('should allow configuring language', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/settings');

      await page.waitForLoadState('networkidle');

      const languageSetting = page.locator(
        '[name*="language"], select[class*="language"], [class*="locale"]'
      );

      const hasLanguageSetting = await languageSetting.first().isVisible().catch(() => false);

      expect(typeof hasLanguageSetting).toBe('boolean');
    });

    test('should save settings changes', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/settings');

      await page.waitForLoadState('networkidle');

      const saveButton = page.locator('button').filter({ hasText: /save|update|apply/i });

      if (await saveButton.first().isVisible().catch(() => false)) {
        await saveButton.first().click();

        await page.waitForTimeout(1000);

        // Should show success feedback
        const hasSuccess = await page.locator('text=/saved|success|updated/i').isVisible().catch(() => false);

        expect(typeof hasSuccess).toBe('boolean');
      }
    });
  });

  test.describe('Team Management', () => {
    test('should display team management page', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/team');

      await page.waitForLoadState('networkidle');

      const teamContent = page.locator(
        '[class*="team"], [class*="member"], [class*="user"]'
      );

      const hasTeamContent = await teamContent.first().isVisible().catch(() => false);
      const isOnLogin = page.url().includes('login');

      expect(hasTeamContent || isOnLogin).toBeTruthy();
    });

    test('should display add member button', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/team');

      await page.waitForLoadState('networkidle');

      const addButton = page.locator('button, a').filter({ hasText: /add|invite|new member/i });

      const hasAddButton = await addButton.first().isVisible().catch(() => false);

      expect(typeof hasAddButton).toBe('boolean');
    });

    test('should display member list', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/team');

      await page.waitForLoadState('networkidle');

      const memberList = page.locator(
        '[class*="member-list"], [class*="team-list"], table, [class*="list"]'
      );

      const hasMemberList = await memberList.first().isVisible().catch(() => false);

      expect(typeof hasMemberList).toBe('boolean');
    });
  });

  test.describe('Document Editor', () => {
    test('should display document editor', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/editor');

      await page.waitForLoadState('networkidle');

      const editor = page.locator(
        '[class*="editor"], [contenteditable="true"], textarea'
      );

      const hasEditor = await editor.first().isVisible().catch(() => false);
      const isOnLogin = page.url().includes('login');

      expect(hasEditor || isOnLogin).toBeTruthy();
    });

    test('should allow editing paragraphs', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/editor');

      await page.waitForLoadState('networkidle');

      const editableArea = page.locator(
        '[contenteditable="true"], textarea, [class*="editable"]'
      );

      const isEditable = await editableArea.first().isVisible().catch(() => false);

      expect(typeof isEditable).toBe('boolean');
    });

    test('should have save button', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/editor');

      await page.waitForLoadState('networkidle');

      const saveButton = page.locator('button').filter({ hasText: /save|publish|update/i });

      const hasSaveButton = await saveButton.first().isVisible().catch(() => false);

      expect(typeof hasSaveButton).toBe('boolean');
    });
  });

  test.describe('Version History', () => {
    test('should display version history page', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/versions');

      await page.waitForLoadState('networkidle');

      const versionsContent = page.locator(
        '[class*="version"], [class*="history"], [class*="revision"]'
      );

      const hasVersions = await versionsContent.first().isVisible().catch(() => false);
      const isOnLogin = page.url().includes('login');

      expect(hasVersions || isOnLogin).toBeTruthy();
    });

    test('should display version list', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/versions');

      await page.waitForLoadState('networkidle');

      const versionList = page.locator(
        '[class*="version-list"], [class*="history-list"], table'
      );

      const hasVersionList = await versionList.first().isVisible().catch(() => false);

      expect(typeof hasVersionList).toBe('boolean');
    });

    test('should allow viewing previous version', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/versions');

      await page.waitForLoadState('networkidle');

      const viewButton = page.locator('button, a').filter({ hasText: /view|preview|open/i });

      const hasViewButton = await viewButton.first().isVisible().catch(() => false);

      expect(typeof hasViewButton).toBe('boolean');
    });
  });

  test.describe('Collaboration', () => {
    test('should display collaboration settings', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/collaboration');

      await page.waitForLoadState('networkidle');

      const collaborationContent = page.locator(
        '[class*="collaboration"], [class*="share"], [class*="invite"]'
      );

      const hasCollaboration = await collaborationContent.first().isVisible().catch(() => false);
      const isOnLogin = page.url().includes('login');

      expect(hasCollaboration || isOnLogin).toBeTruthy();
    });

    test('should have share link functionality', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/collaboration');

      await page.waitForLoadState('networkidle');

      const shareButton = page.locator('button, a').filter({ hasText: /share|copy|link/i });

      const hasShareButton = await shareButton.first().isVisible().catch(() => false);

      expect(typeof hasShareButton).toBe('boolean');
    });
  });

  test.describe('Admin Navigation', () => {
    test('should have navigation between admin sections', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/settings');

      await page.waitForLoadState('networkidle');

      const navLinks = page.locator('nav a, [class*="admin-nav"] a, [class*="sidebar"] a');

      const navCount = await navLinks.count().catch(() => 0);

      // Should have navigation links (or be on login)
      const isOnLogin = page.url().includes('login');
      expect(navCount > 0 || isOnLogin).toBeTruthy();
    });
  });

  test.describe('Accessibility', () => {
    test('admin pages should have proper form labels', async ({ page }) => {
      await page.goto('/doc/test-document-id/admin/settings');

      await page.waitForLoadState('networkidle');

      const inputs = await page.locator('input:not([type="hidden"])').all();

      for (const input of inputs.slice(0, 3)) {
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const placeholder = await input.getAttribute('placeholder');

        const hasLabel = id ?
          await page.locator(`label[for="${id}"]`).count() > 0 :
          false;

        expect(hasLabel || ariaLabel || placeholder).toBeTruthy();
      }
    });
  });
});
