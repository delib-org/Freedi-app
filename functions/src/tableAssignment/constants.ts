/**
 * Local constants of the Tables (table-assignment) service. Product-wide
 * limits (table size, preference count, title length) live in
 * @freedi/shared-types as TABLE_ASSIGNMENT_*; only server-side limits are here.
 */

/** Longest Firestore doc id the callables accept from a client. */
export const MAX_ID_LENGTH = 200;

/** Shortest full name a participant may register with (after trimming). */
export const FULL_NAME_MIN_LENGTH = 2;

/** Most topics one session may carry (keeps a replace inside one transaction). */
export const MAX_TOPICS_PER_SESSION = 100;

/** Registration cap: at least this many, whatever the host expects. */
export const REGISTRATION_CAP_MIN = 200;
/** Registration cap: this many times the number the host expects. */
export const REGISTRATION_CAP_PER_EXPECTED = 3;
/** Registration cap: never above this many. */
export const REGISTRATION_CAP_MAX = 2000;

/** The only sign-in provider a host may create a session with. */
export const HOST_SIGN_IN_PROVIDER = 'google.com';

/** Writes per Firestore batch when erasing or deleting; the limit is 500. */
export const WRITE_BATCH_SIZE = 400;

/** Machine-readable causes the client can branch on (HttpsError details.reason). */
export type TablesErrorReason =
	| 'table-full'
	| 'stale-run'
	| 'registration-closed'
	| 'claimed-by-name'
	| 'seated-in-published-run'
	| 'registration-full'
	| 'name-locked'
	| 'too-few-registrants'
	| 'preview-limit'
	| 'table-size-below-published';

/** Fewer registrants than this are refused a preview: tables that small say too much about each person. */
export const MIN_REGISTRANTS_FOR_PREVIEW = 5;

/** Previews a host may compute over one unchanged set of registrations and answers. */
export const MAX_PREVIEWS_PER_ANSWERS = 5;

/** Previews a host may compute in one session: dummy registrations or removals cannot refill this. */
export const MAX_PREVIEWS_PER_SESSION = 30;

/** Seeds are drawn from this range: the engine's random generator keeps 32 bits of state. */
export const ENGINE_SEED_RANGE = 2 ** 32;
