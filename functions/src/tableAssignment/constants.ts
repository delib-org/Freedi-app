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

/** Position axis bounds (0 = pole A, 100 = pole B). */
export const POSITION_MIN = 0;
export const POSITION_MAX = 100;

/** Machine-readable causes the client can branch on (HttpsError details.reason). */
export type TablesErrorReason =
	| 'table-full'
	| 'stale-run'
	| 'registration-closed'
	| 'claimed-by-name'
	| 'seated-in-published-run'
	| 'too-few-registrants'
	| 'preview-limit';

/** Fewer registrants than this are refused a preview: tables that small say too much about each person. */
export const MIN_REGISTRANTS_FOR_PREVIEW = 5;

/** Previews a host may compute over one unchanged set of registrations and answers. */
export const MAX_PREVIEWS_PER_ANSWERS = 5;
