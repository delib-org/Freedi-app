import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { Collections, StatementType, type Statement } from '@freedi/shared-types';
import { isDerived, isManualCluster } from './derivedDocs';

/** Firestore `in` queries accept at most 30 values. */
export const VOTE_CHECK_IN_BATCH_SIZE = 30;
/** How many `in` batches run at once. */
export const VOTE_CHECK_PARALLEL_BATCHES = 5;
/** Machine-readable reason carried in `HttpsError.details`. */
export const DERIVED_DOCS_HAVE_VOTES_REASON = 'derived-docs-have-votes';

export interface DerivedDocVoteSummary {
	/** Derived docs that carry at least one direct vote. */
	votedDocCount: number;
	/** Total direct votes across those docs. */
	voteCount: number;
}

export interface DerivedDocsHaveVotesDetails extends DerivedDocVoteSummary {
	reason: typeof DERIVED_DOCS_HAVE_VOTES_REASON;
}

/**
 * Counts direct votes on the synthesis output (synth, topic, claim cluster;
 * visible or hidden) under a question.
 *
 * A direct vote is an evaluation whose `statementId` is the derived doc's id and
 * that was cast by a participant. Evaluations carrying `migratedAt` are copies
 * made when a synth absorbed its members' votes: the originals keep their own, so
 * dissolving loses nothing and they are not counted. Manual clusters are
 * preserved by the dissolve and are skipped too.
 */
export async function countDirectVotesOnDerivedDocs(
	questionId: string,
	db: Firestore = getFirestore(),
): Promise<DerivedDocVoteSummary> {
	const optionsSnap = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionId)
		.where('statementType', '==', StatementType.option)
		.get();
	const derivedIds = optionsSnap.docs
		.map((d) => d.data() as Statement)
		.filter((s) => isDerived(s) && !isManualCluster(s))
		.map((s) => s.statementId);

	const batches: string[][] = [];
	for (let i = 0; i < derivedIds.length; i += VOTE_CHECK_IN_BATCH_SIZE) {
		batches.push(derivedIds.slice(i, i + VOTE_CHECK_IN_BATCH_SIZE));
	}

	const votesByDoc = new Map<string, number>();
	for (let i = 0; i < batches.length; i += VOTE_CHECK_PARALLEL_BATCHES) {
		const slice = batches.slice(i, i + VOTE_CHECK_PARALLEL_BATCHES);
		const snaps = await Promise.all(
			slice.map((ids) =>
				db
					.collection(Collections.evaluations)
					.where('statementId', 'in', ids)
					.select('statementId', 'migratedAt')
					.get(),
			),
		);
		for (const snap of snaps) {
			for (const doc of snap.docs) {
				const data = doc.data() as { statementId: string; migratedAt?: number };
				if (typeof data.migratedAt === 'number') continue;
				votesByDoc.set(data.statementId, (votesByDoc.get(data.statementId) ?? 0) + 1);
			}
		}
	}

	let voteCount = 0;
	votesByDoc.forEach((n) => {
		voteCount += n;
	});

	return { votedDocCount: votesByDoc.size, voteCount };
}

/** Throws `failed-precondition` (reason `derived-docs-have-votes`) when any derived doc has direct votes. */
export async function assertNoDirectVotesOnDerivedDocs(
	questionId: string,
	db: Firestore = getFirestore(),
): Promise<void> {
	const summary = await countDirectVotesOnDerivedDocs(questionId, db);
	if (summary.votedDocCount === 0) return;

	logger.info('derivedDocVotes.rebuildRefused', { questionId, ...summary });

	const details: DerivedDocsHaveVotesDetails = {
		reason: DERIVED_DOCS_HAVE_VOTES_REASON,
		...summary,
	};
	throw new HttpsError(
		'failed-precondition',
		'This question already has votes on its merged ideas. Rebuilding would delete them, so it is blocked.',
		details,
	);
}
