/**
 * Pure helpers for email subscriber source handling.
 *
 * Subscribers are stored in a single `emailSubscribers` Firestore collection
 * with a `source` discriminator that tells us which audience they belong to:
 *   - 'mass-consensus'         — subscribed while the survey was open
 *   - 'mass-consensus-closed'  — subscribed after the survey was closed
 *
 * These helpers are shared between the subscribe route (writes) and the admin
 * subscribers route (reads).
 */

export const SUBSCRIBER_SOURCE_ACTIVE = 'mass-consensus' as const;
export const SUBSCRIBER_SOURCE_POST_CLOSE = 'mass-consensus-closed' as const;

export type SubscriberSource =
  | typeof SUBSCRIBER_SOURCE_ACTIVE
  | typeof SUBSCRIBER_SOURCE_POST_CLOSE;

const ALLOWED_SOURCES: ReadonlySet<string> = new Set([
  SUBSCRIBER_SOURCE_ACTIVE,
  SUBSCRIBER_SOURCE_POST_CLOSE,
]);

/**
 * Normalise an incoming `source` value from a subscribe request. Unknown,
 * missing, or non-string values fall back to the default (active-survey)
 * source so callers can't silently create subscribers with arbitrary tags.
 */
export function resolveSubscriberSource(input: unknown): SubscriberSource {
  if (typeof input === 'string' && ALLOWED_SOURCES.has(input)) {
    return input as SubscriberSource;
  }

  return SUBSCRIBER_SOURCE_ACTIVE;
}

export interface RawSubscriberRecord {
  email?: unknown;
  source?: unknown;
}

export interface GroupedSubscribers {
  activeEmails: string[];
  closedEmails: string[];
  allEmails: string[];
  activeCount: number;
  closedCount: number;
}

/**
 * Split raw subscriber records into two groups keyed by source.
 *
 * Rules:
 *   - Records without a valid string email are skipped.
 *   - Emails are lowercased and deduplicated within each group.
 *   - If the same email appears in both the active and post-close groups, the
 *     post-close group wins (it represents the later, current intent).
 *   - Both groups are returned sorted alphabetically.
 *   - `allEmails` is the union of both groups, also sorted.
 */
export function groupSubscribersBySource(
  records: Iterable<RawSubscriberRecord>
): GroupedSubscribers {
  const activeSet = new Set<string>();
  const closedSet = new Set<string>();

  for (const record of records) {
    if (!record || typeof record.email !== 'string') continue;

    const email = record.email.trim().toLowerCase();
    if (!email) continue;

    if (record.source === SUBSCRIBER_SOURCE_POST_CLOSE) {
      closedSet.add(email);
    } else {
      activeSet.add(email);
    }
  }

  for (const email of closedSet) {
    activeSet.delete(email);
  }

  const activeEmails = Array.from(activeSet).sort();
  const closedEmails = Array.from(closedSet).sort();
  const allEmails = Array.from(new Set([...activeEmails, ...closedEmails])).sort();

  return {
    activeEmails,
    closedEmails,
    allEmails,
    activeCount: activeEmails.length,
    closedCount: closedEmails.length,
  };
}
