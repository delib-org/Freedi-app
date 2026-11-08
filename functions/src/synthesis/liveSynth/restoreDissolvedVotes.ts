import { logger } from 'firebase-functions';
import { getFirestore, DocumentData } from 'firebase-admin/firestore';
import { Collections, Evaluation, Statement, User } from '@freedi/shared-types';

/**
 * Give a dissolved synthesis's direct votes back to its surviving option.
 *
 * Before this module the dissolve only archived the cluster's direct
 * evaluations, so those participants' votes vanished from the results.
 *
 * Rules:
 *  - exactly one visible member remains: each archived vote by user U becomes
 *    an evaluation by U on that member, unless U already evaluated it (U's own
 *    vote always wins);
 *  - several (or zero) visible members remain: nothing is guessed, the archive
 *    records which members existed;
 *  - idempotent: the restored doc id is deterministic (`{userId}--{statementId}`,
 *    same shape as every other evaluation) and written with `create()`, which
 *    fails when the doc exists, so a retried trigger cannot duplicate or
 *    overwrite anything.
 *
 * The restored evaluation carries `restoredFromClusterId`. Unlike `migratedAt`
 * it does NOT skip `newEvaluation`: the survivor's counters must be updated by
 * the normal trigger. That trigger skips only the "user acted" side effects
 * (credits, social proof, admin stats, funnel events) when it sees the marker.
 */

export const ORPHANED_VOTES_COLLECTION = '_orphanedClusterVotes';
const FIRESTORE_ALREADY_EXISTS = 6;
const OPERATION = 'liveSynth.restoreDissolvedVotes';

export type RestoredEvaluation = Evaluation & { restoredFromClusterId?: string };

export type RestoreOutcome =
	| 'restored'
	| 'user-already-voted'
	| 'already-restored'
	| 'no-single-survivor'
	| 'survivor-unavailable'
	| 'empty-vote'
	| 'no-user'
	| 'failed';

export interface RestoreSummary {
	clusterId: string;
	survivorId: string | null;
	memberOptionIds: string[];
	outcomes: Map<string, RestoreOutcome>;
}

export interface RestoreInput {
	clusterId: string;
	/** Member option ids that were left in the cluster at dissolve time. */
	memberIds: string[];
	/** The cluster's direct evaluation docs (doc id + data). */
	votes: Array<{ id: string; data: DocumentData }>;
}

function db() {
	return getFirestore();
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isAlreadyExists(error: unknown): boolean {
	const code = (error as { code?: number | string } | null)?.code;

	return code === FIRESTORE_ALREADY_EXISTS || code === 'already-exists';
}

/** Visible = exists and not hidden. */
async function loadVisibleMembers(memberIds: string[]): Promise<Statement[]> {
	const snaps = await Promise.all(
		memberIds.map((id) => db().collection(Collections.statements).doc(id).get()),
	);

	return snaps
		.filter((s) => s.exists)
		.map((s) => s.data() as Statement)
		.filter((s) => s.hide !== true);
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** The voter's uid: `evaluatorId` first, then `evaluator.uid`. */
function voterId(vote: DocumentData): string | undefined {
	return nonEmptyString(vote.evaluatorId) ?? nonEmptyString(vote.evaluator?.uid);
}

/**
 * `newEvaluation` reads the user from `evaluator.uid` and throws without it,
 * so the restored vote always carries an evaluator whose uid is the voter.
 */
function buildEvaluator(vote: DocumentData, userId: string): User {
	const old = vote.evaluator;
	const base: Partial<User> = old && typeof old === 'object' ? (old as Partial<User>) : {};

	return {
		...base,
		uid: userId,
		displayName: typeof base.displayName === 'string' ? base.displayName : '',
	};
}

function buildRestoredEvaluation(
	vote: DocumentData,
	survivor: Statement,
	userId: string,
	clusterId: string,
	evaluationId: string,
): RestoredEvaluation {
	const restored: RestoredEvaluation = {
		evaluationId,
		statementId: survivor.statementId,
		parentId: survivor.parentId,
		evaluatorId: userId,
		evaluation: vote.evaluation as number,
		updatedAt: Date.now(),
		restoredFromClusterId: clusterId,
		evaluator: buildEvaluator(vote, userId),
	};
	if (typeof vote.demographicAnchorId === 'string') {
		restored.demographicAnchorId = vote.demographicAnchorId;
	}
	if (typeof vote.isTestData === 'boolean') restored.isTestData = vote.isTestData;

	return restored;
}

async function restoreOne(
	vote: DocumentData,
	survivor: Statement,
	clusterId: string,
): Promise<RestoreOutcome> {
	const userId = voterId(vote);
	if (!userId) return 'no-user';
	// 0 is a real neutral vote and is restored like any other value.
	if (typeof vote.evaluation !== 'number' || Number.isNaN(vote.evaluation)) {
		return 'empty-vote';
	}

	const evaluationId = `${userId}--${survivor.statementId}`;
	const ref = db().collection(Collections.evaluations).doc(evaluationId);
	try {
		await ref.create(buildRestoredEvaluation(vote, survivor, userId, clusterId, evaluationId));

		return 'restored';
	} catch (error) {
		if (!isAlreadyExists(error)) throw error;
		const existing = (await ref.get()).data() as RestoredEvaluation | undefined;

		return existing?.restoredFromClusterId === clusterId
			? 'already-restored'
			: 'user-already-voted';
	}
}

export async function restoreDissolvedVotes(input: RestoreInput): Promise<RestoreSummary> {
	const { clusterId, memberIds, votes } = input;
	const outcomes = new Map<string, RestoreOutcome>();
	const summary: RestoreSummary = {
		clusterId,
		survivorId: null,
		memberOptionIds: memberIds,
		outcomes,
	};
	if (votes.length === 0) return summary;

	let visible: Statement[] = [];
	try {
		visible = await loadVisibleMembers(memberIds);
	} catch (error) {
		logger.warn('liveSynth.restoreVotes: loading members failed', {
			operation: OPERATION,
			clusterId,
			error: errorMessage(error),
		});
	}

	if (visible.length !== 1) {
		const outcome: RestoreOutcome =
			visible.length > 1 ? 'no-single-survivor' : 'survivor-unavailable';
		votes.forEach((v) => outcomes.set(v.id, outcome));
		logger.info('liveSynth.restoreVotes: not restoring, archive only', {
			operation: OPERATION,
			clusterId,
			memberOptionIds: memberIds,
			visibleMemberCount: visible.length,
			voteCount: votes.length,
		});

		return summary;
	}

	const survivor = visible[0];
	summary.survivorId = survivor.statementId;
	for (const vote of votes) {
		try {
			outcomes.set(vote.id, await restoreOne(vote.data, survivor, clusterId));
		} catch (error) {
			outcomes.set(vote.id, 'failed');
			logger.warn('liveSynth.restoreVotes: restore of one vote failed', {
				operation: OPERATION,
				clusterId,
				survivorId: survivor.statementId,
				evaluationId: vote.id,
				error: errorMessage(error),
			});
		}
	}

	const counts: Record<string, number> = {};
	outcomes.forEach((o) => {
		counts[o] = (counts[o] ?? 0) + 1;
	});
	logger.info('liveSynth.restoreVotes', {
		operation: OPERATION,
		clusterId,
		survivorId: survivor.statementId,
		counts,
	});

	return summary;
}
