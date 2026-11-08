import {
	Collections,
	ODYSSEY_FEEDBACK_GLOBAL_KEY,
	ODYSSEY_FEEDBACK_GLOBAL_PER_DAY,
	ODYSSEY_FEEDBACK_PER_HOUR,
} from '@freedi/shared-types';
import { reserveWindowSlot } from '../utils/rateLimit';

/**
 * Throttles for the feedback letter, in the shape of `reservePlannerMessageSlot`
 * (organizations/studio/planSession.ts) — a transaction on a window document,
 * which is the only lock that survives cold starts and parallel instances.
 *
 * Two budgets, because one is not enough. The per-uid budget stops a person
 * hammering the button; it does nothing about a script, because anonymous uids
 * are free to mint and this project has no App Check. The global budget is what
 * actually bounds the damage: whatever else happens, the game sends at most
 * ODYSSEY_FEEDBACK_GLOBAL_PER_DAY letters a day out of a Gmail account that also
 * carries organization invites and voyage digests.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function reserveSlot(
	docId: string,
	limit: number,
	windowMs: number,
	label: string,
	now: number,
): Promise<void> {
	return reserveWindowSlot({
		collection: Collections.odysseyRateLimits,
		docId,
		limit,
		windowMs,
		// Shown to nobody: the client maps the error CODE to Hebrew. It lands in Cloud Logging.
		label: `Odyssey feedback ${label}`,
		now,
	});
}

/**
 * Reserve one letter for this sender.
 *
 * Per-uid first, so a single spammer exhausts their own budget before touching
 * the global one — otherwise one script could lock every other player out for a
 * day by burning the shared counter.
 */
export async function reserveOdysseyFeedbackSlot(uid: string, now: number): Promise<void> {
	await reserveSlot(uid, ODYSSEY_FEEDBACK_PER_HOUR, HOUR_MS, 'hourly', now);
	await reserveSlot(
		ODYSSEY_FEEDBACK_GLOBAL_KEY,
		ODYSSEY_FEEDBACK_GLOBAL_PER_DAY,
		DAY_MS,
		'global daily',
		now,
	);
}
