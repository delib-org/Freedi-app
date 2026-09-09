import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { Statement } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../config/cors';
import { db } from '../db';
import { act, generate } from './service';

export const deliberation = onCall(
	{
		region: 'me-west1',
		cors: [...ALLOWED_ORIGINS, 'http://localhost:3012'],
		timeoutSeconds: 540,
		memory: '1GiB',
	},
	async (request) => {
		if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
		if (!request.data || typeof request.data !== 'object')
			throw new HttpsError('invalid-argument', 'Invalid request.');

		return act(request.auth.uid, request.data as Record<string, unknown>);
	},
);
export const queueDeliberation = onDocumentWritten(
	{ document: 'statements/{id}', region: 'me-west1' },
	async (event) => {
		const after = event.data?.after.data(),
			before = event.data?.before.data();
		if (after?.statementType === 'question' && after.deliberationEnabled === true && !before) {
			await db
				.collection('questionDeliberations')
				.doc(event.params.id)
				.set(
					{ enabled: true, dirty: true, queuedAt: Date.now(), lastCheckedAt: 0 },
					{ merge: true },
				);

			return;
		}
		const relevant = (d: typeof after) => d && ['option', 'synthesis'].includes(d.statementType);
		if (!relevant(after) && !relevant(before)) return;
		if (
			JSON.stringify([
				after?.statement,
				after?.paragraphs,
				after?.isChosen,
				after?.consensus,
				after?.integratedInto,
				after?.evaluation?.numberOfEvaluators,
				after?.hide,
				after?.parentId,
			]) ===
			JSON.stringify([
				before?.statement,
				before?.paragraphs,
				before?.isChosen,
				before?.consensus,
				before?.integratedInto,
				before?.evaluation?.numberOfEvaluators,
				before?.hide,
				before?.parentId,
			])
		)
			return;
		for (const id of new Set(
			[after?.parentId, before?.parentId].filter(
				(v): v is string => typeof v === 'string' && v !== 'top',
			),
		)) {
			const ref = db.collection('questionDeliberations').doc(id);
			if ((await ref.get()).data()?.enabled)
				await ref.set({ dirty: true, queuedAt: Date.now() }, { merge: true });
		}
	},
);
// Cp-triggered drafts are checked promptly; summaries are independently limited to once per 24h.
export const updateDeliberations = onSchedule(
	{ schedule: 'every 15 minutes', region: 'me-west1', timeoutSeconds: 540, memory: '1GiB' },
	async () => {
		const jobs = await db
			.collection('questionDeliberations')
			.where('dirty', '==', true)
			.orderBy('lastCheckedAt')
			.limit(30)
			.get();
		const startedAt = Date.now();
		for (const job of jobs.docs) {
			if (Date.now() - startedAt > 7 * 60000) break;
			const state = job.data();
			await job.ref.set({ lastCheckedAt: Date.now() }, { merge: true });
			if (!state.enabled) {
				await job.ref.update({ dirty: false });
				continue;
			}
			const question = (await db.collection('statements').doc(job.id).get()).data() as
				| Statement
				| undefined;
			if (
				!question ||
				question.hide ||
				question.questionSettings?.isHalted ||
				question.questionSettings?.pausedAt
			)
				continue;
			try {
				await generate(question, 'agreement', true);
				if (Date.now() - (state.summaryAt || 0) >= 24 * 60 * 60 * 1000) {
					await generate(question, 'summary', true);
					await db.runTransaction(async (tx) => {
						const latest = (await tx.get(job.ref)).data();
						if (latest?.queuedAt === state.queuedAt)
							tx.set(job.ref, { dirty: false, lastCheckedAt: Date.now() }, { merge: true });
					});
				}
			} catch (error) {
				logger.error('Deliberation update failed', {
					questionId: job.id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	},
);
