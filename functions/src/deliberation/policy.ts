import { DELIBERATION_LIMITS } from '../../../packages/shared-types/src/models/covenant/deliberation';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../db';

export const POLICY = {
	dayMs: 24 * 60 * 60 * 1000,
	leaseMs: DELIBERATION_LIMITS.generationTimeoutMs,
	callableSeconds: DELIBERATION_LIMITS.generationTimeoutMs / 1000,
	schedulerBudgetMs: 7 * 60 * 1000,
	batchSize: 30,
	maxAttempts: 3,
	retryMs: 15 * 60 * 1000,
	dailyProjectCalls: 100,
	dailyFacilitatorCalls: 10,
	dailyQuestionCalls: 4,
	summaryTokens: 3500,
} as const;

export async function assertRegisteredFacilitator(uid: string): Promise<void> {
	const user = await getAuth().getUser(uid);
	if (user.disabled || user.providerData.length === 0)
		throw new HttpsError('permission-denied', 'A registered account is required for AI actions.');
}

// Reserve BEFORE contacting the model. Failures consume a reservation too: retries cost money.
// Shared transactional ceilings cover manual actions and all scheduled workers together.
export async function reserveGeneration(uid: string, questionId: string): Promise<void> {
	await assertRegisteredFacilitator(uid);
	const day = Math.floor(Date.now() / POLICY.dayMs);
	const limits = [
		{ id: `project-${day}`, limit: POLICY.dailyProjectCalls },
		{ id: `user-${uid}-${day}`, limit: POLICY.dailyFacilitatorCalls },
		{ id: `question-${questionId}-${day}`, limit: POLICY.dailyQuestionCalls },
	];
	await db.runTransaction(async (tx) => {
		const refs = limits.map((item) => db.collection('deliberationBudgets').doc(item.id));
		const docs = await tx.getAll(...refs);
		if (docs.some((doc, i) => (doc.data()?.calls || 0) >= limits[i].limit))
			throw new HttpsError('resource-exhausted', 'The daily AI generation limit has been reached.');
		docs.forEach((doc, i) => tx.set(refs[i], { calls: (doc.data()?.calls || 0) + 1, day }));
	});
}

export function retryState(error: unknown, attempts: number, now: number) {
	const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
	const transient = [
		'unavailable',
		'internal',
		'aborted',
		'deadline-exceeded',
		'ECONNRESET',
		'ETIMEDOUT',
	].includes(code);
	const retry = transient && attempts < POLICY.maxAttempts;

	return {
		dirty: retry,
		attempts,
		lastCheckedAt: retry ? now + POLICY.retryMs * 2 ** (attempts - 1) : now,
		lastErrorCode: code || 'unknown',
		failedAt: now,
	};
}
