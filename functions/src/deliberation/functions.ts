import { Statement } from '@freedi/shared-types';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { ALLOWED_ORIGINS } from '../config/cors';
import { db } from '../db';
import { POLICY, retryState } from './policy';
import { act, generate, questionFor } from './service';

export const deliberation = onCall(
	{
		region: 'me-west1',
		cors: [...ALLOWED_ORIGINS, 'http://localhost:3012'],
		timeoutSeconds: POLICY.callableSeconds,
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
				await ref.set(
					{ dirty: true, queuedAt: Date.now(), lastCheckedAt: 0, attempts: 0 },
					{ merge: true },
				);
		}
	},
);
// Cp-triggered drafts are checked promptly; summaries are independently limited to once per 24h.
export const updateDeliberations = onSchedule(
	{
		schedule: 'every 15 minutes',
		region: 'me-west1',
		timeoutSeconds: POLICY.callableSeconds,
		memory: '1GiB',
	},
	async () => {
		const jobs = await db
			.collection('questionDeliberations')
			.where('dirty', '==', true)
			.where('lastCheckedAt', '<=', Date.now())
			.orderBy('lastCheckedAt')
			.limit(POLICY.batchSize)
			.get();
		const startedAt = Date.now();
		for (const job of jobs.docs) {
			if (Date.now() - startedAt > POLICY.schedulerBudgetMs) break;
			const state = job.data();
			await job.ref.set({ lastCheckedAt: Date.now() }, { merge: true });
			if (!state.enabled || !state.enabledBy) {
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
			) {
				await job.ref.update({ dirty: false });
				continue;
			}
			try {
				const access = await questionFor(state.enabledBy, job.id);
				if (!access.canManage)
					throw new HttpsError('permission-denied', 'Facilitator access revoked.');
				await generate(question, 'agreement', true);
				const summaryDue = (state.summaryAt || 0) + POLICY.dayMs;
				const summarized = Date.now() >= summaryDue;
				if (summarized) await generate(question, 'summary', true);
				await db.runTransaction(async (tx) => {
					const latest = (await tx.get(job.ref)).data();
					if (latest?.queuedAt === state.queuedAt)
						tx.set(
							job.ref,
							{
								dirty: !summarized,
								attempts: 0,
								lastCheckedAt: summarized ? Date.now() : summaryDue,
							},
							{ merge: true },
						);
				});
			} catch (error) {
				await db.runTransaction(async (tx) => {
					const latest = (await tx.get(job.ref)).data();
					if (latest?.queuedAt === state.queuedAt)
						tx.set(job.ref, retryState(error, (state.attempts || 0) + 1, Date.now()), {
							merge: true,
						});
				});
				logger.error('Deliberation update failed', {
					questionId: job.id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	},
);
