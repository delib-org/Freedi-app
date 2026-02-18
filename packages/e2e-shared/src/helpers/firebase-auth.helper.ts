/**
 * Firebase Auth Emulator helper for E2E tests.
 * Creates and signs in users via the Auth Emulator REST API.
 */

interface EmulatorUser {
  email: string;
  password: string;
  displayName?: string;
  localId?: string;
}

interface SignUpResponse {
  kind: string;
  localId: string;
  email: string;
  idToken: string;
  refreshToken: string;
}

const AUTH_EMULATOR_HOST = 'http://localhost:9099';

/**
 * Create a user in the Firebase Auth Emulator.
 * Returns the user's localId and idToken.
 */
export async function createEmulatorUser(
  user: EmulatorUser,
  projectId = 'delib-5'
): Promise<SignUpResponse> {
  const url = `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      displayName: user.displayName ?? 'Test User',
      returnSecureToken: true,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to create emulator user: ${response.status} ${errorBody}`);
  }

  return response.json() as Promise<SignUpResponse>;
}

/**
 * Sign in an existing user in the Firebase Auth Emulator.
 */
export async function signInEmulatorUser(
  email: string,
  password: string
): Promise<SignUpResponse> {
  const url = `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to sign in emulator user: ${response.status} ${errorBody}`);
  }

  return response.json() as Promise<SignUpResponse>;
}

/**
 * Delete all users from the Auth Emulator.
 */
export async function clearEmulatorUsers(projectId = 'delib-5'): Promise<void> {
  const url = `${AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/accounts`;

  const response = await fetch(url, { method: 'DELETE' });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to clear emulator users: ${response.status} ${errorBody}`);
  }
}

/**
 * Default test user credentials for E2E tests.
 */
export const TEST_USER = {
  email: 'e2e-test@freedi.test',
  password: 'TestPassword123!',
  displayName: 'E2E Test User',
} as const;
