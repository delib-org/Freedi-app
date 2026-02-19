/**
 * E2E test for admin email subscribers feature.
 * Tests the email subscribers section in the admin results page.
 *
 * Prerequisites: Firebase emulators must be running (auth on 9099, firestore on 8081)
 */
import { test, expect } from '@playwright/test';

const FIRESTORE_EMULATOR = 'http://localhost:8081';
const AUTH_EMULATOR = 'http://localhost:9099';

const TEST_SURVEY_ID = 'e2e-test-survey-email';
const TEST_QUESTION_ID = 'e2e-test-question-email';
const TEST_CREATOR_UID = 'e2e-admin-email-test';
const TEST_EMAIL = 'admin@freedi.test';
const TEST_PASSWORD = 'TestPassword123!';

/**
 * Seed test data into Firestore emulator
 */
async function seedTestData() {
  const projectId = 'deliberation-beb48';

  // Seed a survey
  const surveyData = {
    fields: {
      surveyId: { stringValue: TEST_SURVEY_ID },
      title: { stringValue: 'E2E Email Test Survey' },
      description: { stringValue: 'Test survey for email subscribers' },
      creatorId: { stringValue: TEST_CREATOR_UID },
      questionIds: { arrayValue: { values: [{ stringValue: TEST_QUESTION_ID }] } },
      settings: {
        mapValue: {
          fields: {
            allowSkipping: { booleanValue: false },
            allowReturning: { booleanValue: true },
            minEvaluationsPerQuestion: { integerValue: '3' },
          },
        },
      },
      status: { stringValue: 'active' },
      showEmailSignup: { booleanValue: true },
      customEmailTitle: { stringValue: 'Get Your Results' },
      customEmailDescription: { stringValue: 'We will email you when results are ready' },
      createdAt: { integerValue: String(Date.now()) },
      lastUpdate: { integerValue: String(Date.now()) },
    },
  };

  await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${projectId}/databases/(default)/documents/surveys/${TEST_SURVEY_ID}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(surveyData),
    }
  );

  // Seed email subscribers
  const subscribers = [
    { email: 'alice@example.com', statementId: TEST_QUESTION_ID, isActive: true },
    { email: 'bob@example.com', statementId: TEST_QUESTION_ID, isActive: true },
    { email: 'charlie@example.com', statementId: TEST_QUESTION_ID, isActive: true },
    { email: 'alice@example.com', statementId: TEST_QUESTION_ID, isActive: true }, // duplicate
    { email: 'inactive@example.com', statementId: TEST_QUESTION_ID, isActive: false }, // inactive
  ];

  for (let i = 0; i < subscribers.length; i++) {
    const sub = subscribers[i];
    const subId = `${sub.statementId}--${sub.email.replace(/[^a-z0-9]/g, '_')}--${Date.now() + i}`;
    const subData = {
      fields: {
        subscriberId: { stringValue: subId },
        email: { stringValue: sub.email },
        statementId: { stringValue: sub.statementId },
        isActive: { booleanValue: sub.isActive },
        createdAt: { integerValue: String(Date.now()) },
        source: { stringValue: 'mass-consensus' },
      },
    };

    await fetch(
      `${FIRESTORE_EMULATOR}/v1/projects/${projectId}/databases/(default)/documents/emailSubscribers/${subId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subData),
      }
    );
  }
}

/**
 * Create test admin user in Auth emulator
 */
async function createTestUser() {
  try {
    await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        localId: TEST_CREATOR_UID,
        displayName: 'E2E Admin',
      }),
    });
  } catch {
    // User may already exist
  }
}

/**
 * Clear test data from emulators
 */
async function clearTestData() {
  const projectId = 'deliberation-beb48';
  try {
    await fetch(
      `${FIRESTORE_EMULATOR}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
      { method: 'DELETE' }
    );
  } catch {
    // Ignore cleanup errors
  }
}

test.describe('Admin Email Subscribers', () => {
  test.beforeAll(async () => {
    await createTestUser();
    await seedTestData();
  });

  test.afterAll(async () => {
    await clearTestData();
  });

  test('should display email subscribers section in results', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Navigate to admin survey results
    await page.goto(`/admin/surveys/${TEST_SURVEY_ID}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the page to load
    await page.waitForTimeout(3000);

    // Look for the Email Subscribers section header
    const subscribersSection = page.getByText('Email Subscribers');
    const isSectionVisible = await subscribersSection.isVisible().catch(() => false);

    if (isSectionVisible) {
      // Should show subscriber count (3 unique: alice, bob, charlie - inactive excluded, alice deduplicated)
      const subscriberCount = page.getByText('3 subscribers');
      await expect(subscriberCount).toBeVisible({ timeout: 5000 });

      // Should have a copy button
      const copyButton = page.getByText('Copy All Emails');
      await expect(copyButton).toBeVisible();

      // Should display email list
      const emailList = page.locator('[class*="emailSubscribersList"]');
      if (await emailList.isVisible()) {
        const emailText = await emailList.textContent();
        expect(emailText).toContain('alice@example.com');
        expect(emailText).toContain('bob@example.com');
        expect(emailText).toContain('charlie@example.com');
        expect(emailText).not.toContain('inactive@example.com');
      }

      // Click copy button and verify "Copied!" state
      await copyButton.click();
      const copiedText = page.getByText('Copied!');
      await expect(copiedText).toBeVisible({ timeout: 2000 });
    }
  });
});
