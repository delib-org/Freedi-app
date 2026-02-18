/**
 * Extended Playwright test fixture with common utilities for Freedi E2E tests.
 */
import { test as base, type Page } from '@playwright/test';
import {
  createEmulatorUser,
  signInEmulatorUser,
  clearEmulatorUsers,
  TEST_USER,
} from '../helpers/firebase-auth.helper.js';
import { clearFirestoreData } from '../helpers/firebase-seed.helper.js';

interface FreediFixtures {
  /** A test user created in the Firebase Auth Emulator */
  testUser: {
    email: string;
    password: string;
    displayName: string;
    localId: string;
    idToken: string;
  };
}

/**
 * Extended test fixture that provides:
 * - `testUser`: A user created in the Firebase Auth Emulator
 */
export const test = base.extend<FreediFixtures>({
  testUser: async ({}, use) => {
    // Create a fresh test user
    const result = await createEmulatorUser({
      email: TEST_USER.email,
      password: TEST_USER.password,
      displayName: TEST_USER.displayName,
    });

    await use({
      email: TEST_USER.email,
      password: TEST_USER.password,
      displayName: TEST_USER.displayName,
      localId: result.localId,
      idToken: result.idToken,
    });
  },
});

export { base };
export { expect } from '@playwright/test';
