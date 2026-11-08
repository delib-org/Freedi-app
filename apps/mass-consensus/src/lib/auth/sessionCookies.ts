/**
 * Cookie names shared by the server session code and the browser. Kept apart
 * from serverSession.ts so client bundles do not pull in firebase-admin.
 */
export const SESSION_COOKIE = '__session';

/**
 * Readable by JS and never trusted by the server. It only tells the browser
 * that a session cookie for this uid exists, because the HttpOnly session
 * cookie itself cannot be seen from JS.
 */
export const SESSION_MARKER_COOKIE = 'sessionUid';

/** Firebase's maximum session cookie lifetime. */
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
