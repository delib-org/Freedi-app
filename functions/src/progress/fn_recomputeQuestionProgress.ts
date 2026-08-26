/**
 * Admin callable: rebuilds `questionProgress/{statementId}` and every
 * `questionParticipation/{statementId}--{uid}` marker from the source
 * collections. Mirrors the paginated definitions of the MC stats route
 * (`apps/mass-consensus/app/api/statements/[id]/stats/route.ts`).
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { FieldPath, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	QuestionParticipation,
	QuestionProgress,
	Statement,
	StatementType,
	functionConfig,
	getQuestionParticipationId,
} from '@freedi/shared-types';
import { db } from '../db';
import { assertStatementAdmin } from './assertStatementAdmin';
import { ensureProgressDoc } from './questionProgressWriter';

const PAGE_SIZE = 500;
const WRITE_BATCH_SIZE = 400;

interface RecomputeRequest {
	statementId: string;
}

interface ParticipationSets {
	entered: Set<string>;
	suggested: Set<string>;
	evaluated: Set<string>;
	options: number;
	evaluations: number;
}

/** Same derived-option rule as `isDerivedOption` in useParticipationStats. */
function isDerivedOption(statement: Partial<Statement>): boolean {
	return (
		statement.isCluster === true ||
		!!statement.derivedByPipeline ||
		(Array.isArray(statement.integratedOptions) && statement.integratedOptions.length > 0) ||
		!!statement.synthesisRunId ||
		!!statement.synthesisMechanism ||
		statement.statementType === StatementType.synthesis
	);
}

async function forEachPage(
	buildQuery: () => Query,
	onDoc: (doc: QueryDocumentSnapshot) => void,
): Promise<void> {
	let cursor: QueryDocumentSnapshot | null = null;
	for (;;) {
		let pageQuery = buildQuery().limit(PAGE_SIZE);
		if (cursor) pageQuery = pageQuery.startAfter(cursor);
		const page = await pageQuery.get();
		if (page.empty) break;
		page.docs.forEach(onDoc);
		if (page.size < PAGE_SIZE) break;
		cursor = page.docs[page.docs.length - 1];
	}
}

async function collectParticipation(statementId: string): Promise<ParticipationSets> {
	const sets: ParticipationSets = {
		entered: new Set(),
		suggested: new Set(),
		evaluated: new Set(),
		options: 0,
		evaluations: 0,
	};

	// Entered: one statementViews doc per (user, question) — `${uid}--${statementId}`.
	await forEachPage(
		() =>
			db
				.collection(Collections.statementViews)
				.where('statementId', '==', statementId)
				.orderBy(FieldPath.documentId())
				.select('userId'),
		(doc) => {
			const userId = (doc.data() as { userId?: string }).userId ?? doc.id.split('--')[0];
			if (userId) sets.entered.add(userId);
		},
	);

	// Suggested: creators of genuine (non-derived) option children.
	await forEachPage(
		() =>
			db
				.collection(Collections.statements)
				.where('parentId', '==', statementId)
				.where('statementType', '==', StatementType.option)
				.orderBy(FieldPath.documentId())
				.select(
					'creatorId',
					'isCluster',
					'derivedByPipeline',
					'integratedOptions',
					'synthesisRunId',
					'synthesisMechanism',
					'statementType',
				),
		(doc) => {
			const data = doc.data() as Partial<Statement>;
			if (isDerivedOption(data)) return;
			sets.options++;
			if (data.creatorId) sets.suggested.add(data.creatorId);
		},
	);

	// Evaluated: rows WITH an `evaluator` object (rows with only evaluatorId
	// are the automatic self-vote on submission).
	await forEachPage(
		() =>
			db
				.collection(Collections.evaluations)
				.where('parentId', '==', statementId)
				.orderBy('evaluatorId')
				.select('evaluatorId', 'evaluator'),
		(doc) => {
			const uid = (doc.data() as { evaluator?: { uid?: string } }).evaluator?.uid;
			if (!uid) return;
			sets.evaluations++;
			sets.evaluated.add(uid);
		},
	);

	return sets;
}

async function rebuildMarkers(statementId: string, sets: ParticipationSets): Promise<number> {
	const allUsers = new Set([...sets.entered, ...sets.suggested, ...sets.evaluated]);
	let batch = db.batch();
	let pending = 0;
	for (const userId of allUsers) {
		const marker: QuestionParticipation = {
			statementId,
			userId,
			...(sets.entered.has(userId) ? { entered: true } : {}),
			...(sets.suggested.has(userId) ? { suggested: true } : {}),
			...(sets.evaluated.has(userId) ? { evaluated: true } : {}),
		};
		batch.set(
			db
				.collection(Collections.questionParticipation)
				.doc(getQuestionParticipationId(statementId, userId)),
			marker,
		);
		pending++;
		if (pending >= WRITE_BATCH_SIZE) {
			await batch.commit();
			batch = db.batch();
			pending = 0;
		}
	}
	if (pending > 0) await batch.commit();

	return allUsers.size;
}

export async function recomputeQuestionProgressForAdmin(
	uid: string,
	statementId: string,
): Promise<QuestionProgress> {
	const { statement } = await assertStatementAdmin(uid, statementId, 'progress.recompute');
	const ctx = await ensureProgressDoc(statement);
	const sets = await collectParticipation(statementId);
	const markers = await rebuildMarkers(statementId, sets);

	const progressRef = db.collection(Collections.questionProgress).doc(statementId);
	const existing = (await progressRef.get()).data() as Partial<QuestionProgress> | undefined;
	const now = Date.now();
	const progress: QuestionProgress = {
		statementId,
		topParentId: ctx.topParentId,
		...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
		entered: sets.entered.size,
		suggested: sets.suggested.size,
		evaluated: sets.evaluated.size,
		options: sets.options,
		evaluations: sets.evaluations,
		lastActivity: existing?.lastActivity ?? now,
		...(existing?.lastNudgeAt ? { lastNudgeAt: existing.lastNudgeAt } : {}),
		lastUpdate: now,
	};
	await progressRef.set(progress);

	logger.info('[progress] recomputed question progress', {
		statementId,
		entered: progress.entered,
		suggested: progress.suggested,
		evaluated: progress.evaluated,
		options: progress.options,
		evaluations: progress.evaluations,
		markers,
	});

	return progress;
}

export const fn_recomputeQuestionProgress = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<RecomputeRequest>): Promise<QuestionProgress> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const statementId = request.data?.statementId;
		if (!statementId || typeof statementId !== 'string') {
			throw new HttpsError('invalid-argument', 'statementId is required');
		}

		return recomputeQuestionProgressForAdmin(uid, statementId);
	},
);
