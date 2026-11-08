/**
 * Cookie names and lifetimes shared by the server, the edge middleware and the
 * browser. Holds no server imports, so client bundles stay free of firebase-admin.
 */
export const SESSION_COOKIE = '__session';

/**
 * Readable by JS and never trusted by the server. It only tells the browser
 * that a session cookie for this uid exists, because the HttpOnly session
 * cookie itself cannot be seen from JS.
 */
export const SESSION_MARKER_COOKIE = 'sessionUid';

/** Holds only a server-minted `anon_` id; see requestIdentity.ts. */
export const SECURE_UID_COOKIE = '_uid';

/** Firebase's maximum session cookie lifetime. */
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
