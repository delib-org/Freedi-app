/**
 * Local constants of the Tables (table-assignment) service. Product-wide
 * limits (table size, preference count, title length) live in
 * @freedi/shared-types as TABLE_ASSIGNMENT_*; only server-side limits are here.
 */

/** Direct mode: one counter doc per table, `${sessionId}_${tableIndex}`. Server-only (no client rules). */
export const TABLE_ASSIGNMENT_SEATS_COLLECTION = 'tableAssignmentSeats';

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
export type TablesErrorReason = 'table-full' | 'stale-run' | 'registration-closed';

/** A table's position mean/sd is stored only with at least this many known positions; fewer could identify a person. */
export const TABLE_STATS_MIN_KNOWN_POSITIONS = 3;
