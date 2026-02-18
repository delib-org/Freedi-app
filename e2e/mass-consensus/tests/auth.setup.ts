/**
 * Auth setup for mass-consensus app E2E tests.
 * Creates a test user in the Firebase Auth Emulator.
 */
import { test as setup } from '@playwright/test';
import {
  createEmulatorUser,
  TEST_USER,
} from '@freedi/e2e-shared';

setup('create test user in emulator', async () => {
  try {
    await createEmulatorUser({
      email: TEST_USER.email,
      password: TEST_USER.password,
      displayName: TEST_USER.displayName,
    });
  } catch {
    // User may already exist from a previous run - that's OK
  }
});
