/**
 * Constants for the home activity feed (`userFeed`).
 *
 * See docs/architecture/firebase-cost-2026-10/lane-a-feed.md for the full
 * update-chain map and the rollout plan.
 */

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

/**
 * A discussion fans its activity out to members at most once per window.
 * Activity inside an open window is coalesced into the fan-out that opened it
 * (leading-edge throttle), so a burst of 50 messages costs one fan-out.
 */
export const USER_FEED_ACTIVITY_WINDOW_MS = MINUTE_MS;

/** Firestore's per-batch write cap; fan-out pages through members in pages of this size. */
export const USER_FEED_FANOUT_PAGE_SIZE = 500;

/**
 * ROLLOUT SWITCH — legacy activity stamp on `statementsSubscribe.lastUpdate`.
 *
 * Phase 1 (true): every activity fan-out ALSO stamps the members' subscription
 * docs, so clients that still order the home page by subscription lastUpdate
 * keep working while the new client (reading `userFeed`) rolls out.
 *
 * Phase 2 (false): only `userFeed` is written. Each stamped subscription doc
 * woke 3 membership triggers (handleWaitingRoleSubscriptions,
 * validateRoleChange, updateStatementMemberCount), so turning this off is
 * where the invocation savings land.
 *
 * Rollback of phase 2: set back to true and redeploy the functions that
 * import it (onStatementCreated, updateParentOnChildUpdate).
 */
export const SUBSCRIPTION_ACTIVITY_STAMP_ENABLED = false;
