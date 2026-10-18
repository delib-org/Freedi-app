/**
 * Classification of Firebase Auth popup errors.
 *
 * Kept free of any firebase import so it can be unit tested and used from
 * both the sign-in code path and Sentry config without side effects.
 */

/** Codes that mean the user simply backed out of the sign-in popup. */
const USER_CANCELLED_CODES: ReadonlySet<string> = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
]);

const POPUP_BLOCKED_CODE = 'auth/popup-blocked';

function getErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;

  return typeof code === 'string' ? code : null;
}

/** True when the user closed the popup or a newer popup replaced this one. */
export function isUserCancelledAuthError(error: unknown): boolean {
  const code = getErrorCode(error);

  return code !== null && USER_CANCELLED_CODES.has(code);
}

/** True when the browser refused to open the sign-in popup. */
export function isPopupBlockedAuthError(error: unknown): boolean {
  return getErrorCode(error) === POPUP_BLOCKED_CODE;
}
