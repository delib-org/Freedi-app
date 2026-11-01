import { getFirestore, type Firestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { Collections, StatementType, type Statement } from '@freedi/shared-types';
import { isDerived, isManualCluster } from './derivedDocs';

/** Firestore `in` queries accept at most 30 values. */
export const VOTE_CHECK_IN_BATCH_SIZE = 30;
/** Evaluations read per page while looking for the first real vote. */
export const VOTE_CHECK_PAGE_SIZE = 200;
/** Machine-readable reason carried in `HttpsError.details`. */
export const DERIVED_DOCS_HAVE_VOTES_REASON = 'derived-docs-have-votes';

export interface DerivedDocsHaveVotesDetails {
	reason: typeof DERIVED_DOCS_HAVE_VOTES_REASON;
	hasVotes: true;
}

/** Ids of the synthesis output (synth, topic, claim cluster; visible or hidden) the dissolve would delete. */
async function loadDissolvableDerivedIds(questionId: string, db: Firestore): Promise<string[]> {
	const optionsSnap = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionId)
		.where('statementType', '==', StatementType.option)
		.get();

	return optionsSnap.docs
		.map((d) => d.data() as Statement)
		.filter((s) => isDerived(s) && !isManualCluster(s))
		.map((s) => s.statementId);
}

/** Pages through the evaluations of up to 30 docs; true at the first non-migrated one. */
async function batchHasDirectVote(db: Firestore, ids: string[]): Promise<boolean> {
	let cursor: DocumentSnapshot | undefined;
	for (;;) {
		let query = db
			.collection(Collections.evaluations)
			.where('statementId', 'in', ids)
			.select('migratedAt')
			.limit(VOTE_CHECK_PAGE_SIZE);
		if (cursor) query = query.startAfter(cursor);
		const snap = await query.get();

		const found = snap.docs.some(
			(doc) => typeof (doc.data() as { migratedAt?: unknown }).migratedAt !== 'number',
		);
		if (found) return true;
		if (snap.docs.length < VOTE_CHECK_PAGE_SIZE) return false;
		cursor = snap.docs[snap.docs.length - 1];
	}
}

/**
 * True when any derived doc under the question holds at least one direct vote:
 * an evaluation whose `statementId` is the derived doc's id, cast by a
 * participant. Evaluations carrying `migratedAt` are copies made when a synth
 * absorbed its members' votes; the originals keep their own, so dissolving
 * loses nothing and they are skipped. Manual clusters survive the dissolve and
 * are skipped too.
 *
 * Stops reading at the first real vote, so a question with votes costs a page,
 * not every evaluation on every synth.
 */
export async function hasDirectVotesOnDerivedDocs(
	questionId: string,
	db: Firestore = getFirestore(),
): Promise<boolean> {
	const derivedIds = await loadDissolvableDerivedIds(questionId, db);
	for (let i = 0; i < derivedIds.length; i += VOTE_CHECK_IN_BATCH_SIZE) {
		const ids = derivedIds.slice(i, i + VOTE_CHECK_IN_BATCH_SIZE);
		if (await batchHasDirectVote(db, ids)) return true;
	}

	return false;
}

/** Throws `failed-precondition` (reason `derived-docs-have-votes`) when any derived doc has a direct vote. */
export async function assertNoDirectVotesOnDerivedDocs(
	questionId: string,
	db: Firestore = getFirestore(),
): Promise<void> {
	if (!(await hasDirectVotesOnDerivedDocs(questionId, db))) return;

	logger.info('derivedDocVotes.rebuildRefused', { questionId });

	const details: DerivedDocsHaveVotesDetails = {
		reason: DERIVED_DOCS_HAVE_VOTES_REASON,
		hasVotes: true,
	};
	throw new HttpsError(
		'failed-precondition',
		'This question already has votes on its merged ideas. Rebuilding would delete them, so it is blocked.',
		details,
	);
}
