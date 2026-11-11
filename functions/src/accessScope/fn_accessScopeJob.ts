import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
	Collections,
	functionConfig,
	isAnswerTypeLevel,
	type Statement,
} from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';
import { AccessScopeLevels } from './accessScopeLevels';

/** Firestore's batch limit is 500; leave room. */
const PAGE_SIZE = 400;
/** One run stops here and hands over, so even a huge tree never meets the timeout. */
const PAGES_PER_RUN = 10;

export interface AccessScopeJob {
	rootId: string;
	/** The tree to walk. `parents` is too short on many statements to find a subtree. */
	topParentId: string;
	/** A private setting the root just dropped: copies of it on answers go with it. */
	clearCopiesOf?: string;
	status: 'pending' | 'done';
	cursor: string | null;
	generation: number;
	updatedAt: number;
}

interface PageResult {
	written: number;
	lastId: string | null;
	isLast: boolean;
}

async function restampPage(
	firestore: Firestore,
	topParentId: string,
	cursor: string | null,
	levels: AccessScopeLevels,
): Promise<PageResult> {
	let query = firestore
		.collection(Collections.statements)
		.where('topParentId', '==', topParentId)
		.orderBy('__name__')
		.limit(PAGE_SIZE);
	if (cursor) query = query.startAfter(cursor);

	const snapshot = await query.get();
	const docs: QueryDocumentSnapshot[] = snapshot.docs;
	const subjects = docs.map((doc) => ({ ...(doc.data() as Statement), statementId: doc.id }));
	await levels.load(subjects);

	const batch = firestore.batch();
	let written = 0;
	subjects.forEach((subject, index) => {
		const accessScope = levels.scopeOf(subject);
		if (accessScope === subject.accessScope) return;
		batch.update(docs[index].ref, { accessScope });
		written += 1;
	});
	if (written > 0) await batch.commit();

	return {
		written,
		lastId: docs.length > 0 ? docs[docs.length - 1].id : cursor,
		isLast: docs.length < PAGE_SIZE,
	};
}

/**
 * A question's old private setting, copied onto its answers, would make each
 * answer look private in its own right once the question has moved on. An
 * answer never chose it. Clears the copies so they inherit like any child.
 */
async function clearCopiedSettings(
	firestore: Firestore,
	rootId: string,
	access: string,
): Promise<void> {
	const snapshot = await firestore
		.collection(Collections.statements)
		.where('parentId', '==', rootId)
		.where('membership.access', '==', access)
		.get();
	const copies = snapshot.docs.filter((doc) => isAnswerTypeLevel(doc.data() as Statement));
	for (let start = 0; start < copies.length; start += PAGE_SIZE) {
		const batch = firestore.batch();
		copies
			.slice(start, start + PAGE_SIZE)
			.forEach((doc) => batch.update(doc.ref, { 'membership.access': FieldValue.delete() }));
		await batch.commit();
	}
}

/**
 * Re-stamps one slice of a subtree and records how far it got. Writing the
 * cursor fires this function again for the next slice, so no single run is
 * long; `done` ends the chain. Safe to repeat: a statement already correct is
 * not written. A newer change to the same level restarts it from the top, and
 * the generation check stops the older run from overwriting that restart.
 */
export async function runAccessScopeJob(firestore: Firestore, jobId: string): Promise<void> {
	const jobRef = firestore.collection(Collections.accessScopeJobs).doc(jobId);
	const job = (await jobRef.get()).data() as AccessScopeJob | undefined;
	if (!job || job.status !== 'pending') return;

	if (job.cursor === null && job.clearCopiesOf) {
		await clearCopiedSettings(firestore, job.rootId, job.clearCopiesOf);
	}

	const levels = new AccessScopeLevels(firestore);
	let cursor = job.cursor;
	let isLast = false;
	for (let page = 0; page < PAGES_PER_RUN && !isLast; page += 1) {
		const result = await restampPage(firestore, job.topParentId, cursor, levels);
		cursor = result.lastId;
		isLast = result.isLast;
	}

	await firestore.runTransaction(async (transaction) => {
		const current = (await transaction.get(jobRef)).data() as AccessScopeJob | undefined;
		if (!current || current.generation !== job.generation) return;
		transaction.update(jobRef, {
			cursor,
			status: isLast ? 'done' : 'pending',
			updatedAt: Date.now(),
		});
	});
}

export const onAccessScopeJobWritten = onDocumentWritten(
	{
		document: `${Collections.accessScopeJobs}/{jobId}`,
		region: functionConfig.region,
		timeoutSeconds: 540,
		memory: '512MiB',
		maxInstances: 5,
		retry: true,
	},
	async (event) => {
		const after = event.data?.after.data() as AccessScopeJob | undefined;
		if (!after || after.status !== 'pending') return;
		try {
			await runAccessScopeJob(db, event.params.jobId);
		} catch (error) {
			logError(error, {
				operation: 'accessScope.onAccessScopeJobWritten',
				statementId: event.params.jobId,
			});
			throw error;
		}
	},
);
