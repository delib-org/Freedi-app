/**
 * E2E tests for the Suggestion mechanism with voting, comments, and preservation.
 *
 * Tests:
 * 1. Comment toggle on suggestions — opens/closes comment thread
 * 2. Suggestion filtering — promoted and old-version suggestions are hidden
 * 3. Current version display — badge and divider
 * 4. No uncaught errors on load
 *
 * Prerequisites:
 * - Firebase emulators running (auth: 9099, firestore: 8081)
 * - Sign app running on localhost:3002
 */
import { test, expect, type Page } from '@playwright/test';
import {
  clearFirestoreData,
} from '@freedi/e2e-shared';

const FIRESTORE_EMULATOR_HOST = 'http://localhost:8081';
// Must match the sign app's FIREBASE_PROJECT_ID (from .env.local)
const PROJECT_ID = 'freedi-test';

// IDs used across tests
const DOCUMENT_ID = 'e2e-doc-suggestions';
const PARAGRAPH_ID = 'e2e-para-1';
const SUGGESTION_1_ID = 'e2e-suggestion-1';
const SUGGESTION_2_ID = 'e2e-suggestion-2';
const USER_ID = 'e2e-test-user-id';

/**
 * Upsert a document into Firestore emulator using PATCH (avoids 409 conflicts).
 */
async function upsertDocument(
  collection: string,
  id: string,
  data: Record<string, unknown>,
  projectId = PROJECT_ID
): Promise<void> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = convertToFirestoreValue(value);
  }

  const url = `${FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${collection}/${id}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer owner',
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to upsert document ${collection}/${id}: ${response.status} ${errorBody}`);
  }
}

function convertToFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(convertToFirestoreValue),
      },
    };
  }
  if (typeof value === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      fields[k] = convertToFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

/** Seed a document with paragraphs and suggestions for testing */
async function seedTestDocument(): Promise<void> {
  const now = Date.now();

  await Promise.all([
    // Top-level document statement
    upsertDocument('statements', DOCUMENT_ID, {
      statementId: DOCUMENT_ID,
      statement: 'E2E Test Document - Suggestions',
      statementType: 'question',
      parentId: 'root',
      topParentId: DOCUMENT_ID,
      creatorId: USER_ID,
      creator: { displayName: 'E2E Admin', uid: USER_ID },
      createdAt: now,
      lastUpdate: now,
      consensus: 0,
      hide: false,
      isDocument: true,
      allowAnonymousLogin: true,
      signSettings: {
        enableSuggestions: true,
        isPublic: true,
        hideUserIdentity: false,
      },
    }),
    // Official paragraph
    upsertDocument('statements', PARAGRAPH_ID, {
      statementId: PARAGRAPH_ID,
      statement: 'This is the official paragraph text for testing.',
      statementType: 'option',
      parentId: DOCUMENT_ID,
      topParentId: DOCUMENT_ID,
      creatorId: USER_ID,
      creator: { displayName: 'E2E Admin', uid: USER_ID },
      createdAt: now,
      lastUpdate: now,
      consensus: 0,
      hide: false,
      doc: {
        isDoc: true,
        order: 0,
        isOfficialParagraph: true,
        paragraphType: 'paragraph',
      },
    }),
    // Active suggestion 1 (should be visible)
    upsertDocument('statements', SUGGESTION_1_ID, {
      statementId: SUGGESTION_1_ID,
      statement: 'This is a suggested alternative text.',
      statementType: 'option',
      parentId: PARAGRAPH_ID,
      topParentId: DOCUMENT_ID,
      creatorId: 'other-user-1',
      creator: { displayName: 'Contributor A', uid: 'other-user-1' },
      createdAt: now - 60000,
      lastUpdate: now - 60000,
      consensus: 0.5,
      hide: false,
      reasoning: 'I think this version is clearer.',
      evaluation: {
        numberOfProEvaluators: 3,
        numberOfConEvaluators: 1,
        numberOfEvaluators: 4,
      },
    }),
    // Active suggestion 2
    upsertDocument('statements', SUGGESTION_2_ID, {
      statementId: SUGGESTION_2_ID,
      statement: 'A second alternative suggestion.',
      statementType: 'option',
      parentId: PARAGRAPH_ID,
      topParentId: DOCUMENT_ID,
      creatorId: 'other-user-2',
      creator: { displayName: 'Contributor B', uid: 'other-user-2' },
      createdAt: now - 30000,
      lastUpdate: now - 30000,
      consensus: 0.2,
      hide: false,
      evaluation: {
        numberOfProEvaluators: 1,
        numberOfConEvaluators: 1,
        numberOfEvaluators: 2,
      },
    }),
  ]);
}

/** Seed a promoted suggestion (simulates after executeReplacement) */
async function seedPromotedSuggestion(): Promise<void> {
  const now = Date.now();

  await upsertDocument('statements', 'e2e-promoted-suggestion', {
    statementId: 'e2e-promoted-suggestion',
    statement: 'This was promoted to official.',
    statementType: 'option',
    parentId: PARAGRAPH_ID,
    topParentId: DOCUMENT_ID,
    creatorId: 'other-user-3',
    creator: { displayName: 'Contributor C', uid: 'other-user-3' },
    createdAt: now - 120000,
    lastUpdate: now,
    consensus: 0.8,
    hide: false,
    versionControl: {
      currentVersion: 1,
      promotedToVersion: 2,
      promotedAt: now,
    },
  });
}

/** Seed an old-version suggestion (marked with forVersion) */
async function seedOldVersionSuggestion(): Promise<void> {
  const now = Date.now();

  await upsertDocument('statements', 'e2e-old-version-suggestion', {
    statementId: 'e2e-old-version-suggestion',
    statement: 'This was for the old version.',
    statementType: 'option',
    parentId: PARAGRAPH_ID,
    topParentId: DOCUMENT_ID,
    creatorId: 'other-user-4',
    creator: { displayName: 'Contributor D', uid: 'other-user-4' },
    createdAt: now - 180000,
    lastUpdate: now,
    consensus: 0.3,
    hide: false,
    versionControl: {
      currentVersion: 1,
      forVersion: 1,
    },
  });
}

/**
 * Open the suggestion thread modal by clicking the "Suggest" button
 * on the InteractionBar. Returns the dialog locator for scoping.
 */
async function openSuggestionModal(page: Page): Promise<void> {
  // Hover over the paragraph to reveal the InteractionBar
  const paragraph = page.locator('text=This is the official paragraph text for testing.');
  await expect(paragraph).toBeVisible({ timeout: 15_000 });
  await paragraph.hover();

  // Click the "Suggest" button (use force to bypass any overlay)
  const suggestBtn = page.getByTitle('Suggest Alternative').first();
  await suggestBtn.click({ force: true, timeout: 5_000 });

  // Wait for the suggestion modal dialog to appear
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
}

test.describe('Suggestion Mechanism — Comments & Preservation', () => {
  // Run serially — all tests share the same Firestore emulator
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    // Clear all Firestore data for a clean slate (use sign app's project ID)
    await clearFirestoreData(PROJECT_ID);
  });

  test.describe('Comment Toggle on Suggestions', () => {
    test('should show Comments button on each suggestion in the modal', async ({ page }) => {
      await seedTestDocument();

      await page.goto(`/doc/${DOCUMENT_ID}`);
      await page.waitForLoadState('domcontentloaded');
      await openSuggestionModal(page);

      // Inside the dialog, find the Comments buttons (from our new Suggestion component)
      const dialog = page.getByRole('dialog');
      const commentButtons = dialog.getByRole('button', { name: /^comments$/i });
      const count = await commentButtons.count();

      // Should have at least 3: current version + 2 suggestions
      expect(count).toBeGreaterThanOrEqual(3);
    });

    test('should toggle comment thread visibility when clicking Comments button', async ({ page }) => {
      await seedTestDocument();

      await page.goto(`/doc/${DOCUMENT_ID}`);
      await page.waitForLoadState('domcontentloaded');
      await openSuggestionModal(page);

      const dialog = page.getByRole('dialog');

      // Click the first Comments button inside the suggestion modal
      const commentToggle = dialog.getByRole('button', { name: /^comments$/i }).first();
      await expect(commentToggle).toBeVisible({ timeout: 5_000 });
      await commentToggle.click();

      // Comment section should now be visible — look for textarea or "No comments yet"
      const commentSection = dialog.locator('text=No comments yet').or(
        dialog.locator('textarea[placeholder*="comment" i]')
      );
      await expect(commentSection.first()).toBeVisible({ timeout: 5_000 });

      // The button should now say "Hide Comments"
      const hideButton = dialog.getByRole('button', { name: /hide comments/i }).first();
      await expect(hideButton).toBeVisible({ timeout: 3_000 });
      await hideButton.click();

      // After clicking Hide, the comment textarea should disappear
      await expect(
        dialog.locator('text=No comments yet').first()
      ).not.toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe('Suggestion Filtering — Promoted & Old-Version', () => {
    test('promoted suggestions should NOT appear in active suggestion list', async ({ page }) => {
      await seedTestDocument();
      await seedPromotedSuggestion();

      await page.goto(`/doc/${DOCUMENT_ID}`);
      await page.waitForLoadState('domcontentloaded');
      await openSuggestionModal(page);

      const dialog = page.getByRole('dialog');

      // The promoted suggestion text should NOT be visible in the modal
      await expect(dialog.locator('text=This was promoted to official.')).not.toBeVisible({ timeout: 3_000 });

      // But active suggestions should still be visible
      await expect(dialog.locator('text=This is a suggested alternative text.')).toBeVisible({ timeout: 5_000 });
    });

    test('old-version suggestions should NOT appear in active suggestion list', async ({ page }) => {
      await seedTestDocument();
      await seedOldVersionSuggestion();

      await page.goto(`/doc/${DOCUMENT_ID}`);
      await page.waitForLoadState('domcontentloaded');
      await openSuggestionModal(page);

      const dialog = page.getByRole('dialog');

      // The old-version suggestion text should NOT be visible
      await expect(dialog.locator('text=This was for the old version.')).not.toBeVisible({ timeout: 3_000 });

      // Active suggestions should still be visible
      await expect(dialog.locator('text=A second alternative suggestion.')).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Current Version Display', () => {
    test('should show current version badge in suggestion modal', async ({ page }) => {
      await seedTestDocument();

      await page.goto(`/doc/${DOCUMENT_ID}`);
      await page.waitForLoadState('domcontentloaded');
      await openSuggestionModal(page);

      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('text=Current Version')).toBeVisible({ timeout: 5_000 });
    });

    test('should show "Suggested Alternatives" divider when suggestions exist', async ({ page }) => {
      await seedTestDocument();

      await page.goto(`/doc/${DOCUMENT_ID}`);
      await page.waitForLoadState('domcontentloaded');
      await openSuggestionModal(page);

      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('text=Suggested Alternatives')).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('No Uncaught Errors', () => {
    test('document with suggestions loads without errors', async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });

      await seedTestDocument();

      await page.goto(`/doc/${DOCUMENT_ID}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(3000);

      expect(pageErrors).toHaveLength(0);
    });

    test('document with promoted + old-version suggestions loads without errors', async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });

      await seedTestDocument();
      await seedPromotedSuggestion();
      await seedOldVersionSuggestion();

      await page.goto(`/doc/${DOCUMENT_ID}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(3000);

      expect(pageErrors).toHaveLength(0);
    });
  });
});
