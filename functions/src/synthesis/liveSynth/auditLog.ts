import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

/**
 * Append-only audit log for live-synth mutations.
 *
 * Every transformative action the live-synth pipeline performs (attach a
 * member to a cluster, spawn a cluster, unlink, dissolve, …) writes one
 * document to `_synthAuditLog/{eventId}`. The doc records `prevState` and
 * `newState` so a single bad event can be reversed individually with
 * `scripts/reverseLiveSynthEvent.ts` (per `plans/synthesis-100k-living-
 * synth.md` §"Per-ship rollback procedure / Mode A: bad attaches/spawns").
 *
 * The collection is intentionally underscore-prefixed (`_synthAuditLog`)
 * to mark it as internal infrastructure — UI code MUST NOT read from it.
 *
 * Failure mode: never throws. Audit-log write failures are logged at
 * warn level and swallowed; a missed audit entry is preferable to
 * blocking the underlying mutation. Operators can backfill from
 * Firestore change history if the audit gap matters for an investigation.
 */

export type LiveSynthAction =
	| 'attach' // option appended to an existing cluster's integratedOptions
	| 'spawn' // new cluster statement created from two similar options
	| 'unlink' // option removed from a cluster (edit invalidation)
	| 'dissolve' // cluster deleted (member count dropped to <2)
	| 'review-queued'; // gray-band match logged to admin review, no action taken

export interface AuditEntry {
	action: LiveSynthAction;
	clusterId: string;
	optionId?: string;
	/** Why the action fired — operator-readable, NOT user-facing. */
	reason: string;
	/** Snapshot of the affected fields BEFORE the change. */
	prevState?: Record<string, unknown>;
	/** Snapshot of the affected fields AFTER the change. */
	newState?: Record<string, unknown>;
	/** Trigger that originated the action — e.g. 'fn_onOptionCreateLive'. */
	triggerSource: string;
	/** Optional caller for per-tenant filtering / debugging. */
	parentStatementId?: string;
}

const COLLECTION = '_synthAuditLog';

function db() {
	return getFirestore();
}

/**
 * Append one entry. Doc id is auto-generated; the unique id is also
 * returned to the caller in case it needs to reference the audit row
 * from the same code path (e.g. for end-user notifications: "we attached
 * your idea to cluster X — audit id Y").
 */
export async function recordLiveSynthEvent(entry: AuditEntry): Promise<string | null> {
	try {
		const ref = db().collection(COLLECTION).doc();
		await ref.set({
			eventId: ref.id,
			actor: 'liveSynth',
			...entry,
			timestamp: Date.now(),
		});

		return ref.id;
	} catch (error) {
		logger.warn('liveSynth.audit failed', {
			action: entry.action,
			clusterId: entry.clusterId,
			optionId: entry.optionId,
			error: error instanceof Error ? error.message : String(error),
		});

		return null;
	}
}

export const __INTERNAL = { COLLECTION };
