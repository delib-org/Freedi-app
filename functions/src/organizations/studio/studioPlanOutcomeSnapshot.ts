import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	QuestionProgress,
	Statement,
	StudioPlanOutcome,
	StudioPlanSession,
	STUDIO_PLAN_OUTCOME_DELAY_DAYS,
	functionConfig,
} from '@freedi/shared-types';
import { db } from '../../db';
import { logError } from '../../utils/errorHandling';

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 100;

/** Participation of a built plan's question tree, from the progress counters. */
export async function snapshotOutcome(
	topQuestionId: string,
	now: number,
): Promise<StudioPlanOutcome> {
	const [progressSnap, childrenSnap] = await Promise.all([
		db.collection(Collections.questionProgress).where('topParentId', '==', topQuestionId).get(),
		db.collection(Collections.statements).where('parentId', '==', topQuestionId).get(),
	]);
	const outcome: StudioPlanOutcome = {
		snapshotAt: now,
		entered: 0,
		suggested: 0,
		evaluated: 0,
		options: 0,
		evaluations: 0,
		activitiesTotal: 0,
		activitiesClosed: 0,
	};
	progressSnap.docs.forEach((doc) => {
		const p = doc.data() as Partial<QuestionProgress>;
		if (p.statementId === topQuestionId) return; // the top question mirrors its children
		outcome.entered += p.entered ?? 0;
		outcome.suggested += p.suggested ?? 0;
		outcome.evaluated += p.evaluated ?? 0;
		outcome.options += p.options ?? 0;
		outcome.evaluations += p.evaluations ?? 0;
	});
	childrenSnap.docs.forEach((doc) => {
		const s = doc.data() as Partial<Statement>;
		if (s.hide) return;
		outcome.activitiesTotal++;
		if (s.statementSettings?.questionStatus === 'closed') outcome.activitiesClosed++;
	});

	return outcome;
}

/** Testable body: sessions built ≥ 30 days ago without an outcome yet. */
export async function runOutcomeSnapshots(now: number = Date.now()): Promise<number> {
	const cutoff = now - STUDIO_PLAN_OUTCOME_DELAY_DAYS * DAY_MS;
	const snap = await db
		.collection(Collections.studioPlanSessions)
		.where('status', '==', 'built')
		.where('build.completedAt', '<=', cutoff)
		.limit(BATCH)
		.get();
	let written = 0;
	for (const doc of snap.docs) {
		const session = doc.data() as StudioPlanSession;
		if (session.outcome || !session.build?.topQuestionId) continue;
		try {
			const outcome = await snapshotOutcome(session.build.topQuestionId, now);
			await doc.ref.update({ outcome, lastUpdate: now });
			written++;
		} catch (error) {
			logError(error, {
				operation: 'studio.plan.outcomeSnapshot',
				statementId: session.build.topQuestionId,
				metadata: { sessionId: session.sessionId },
			});
		}
	}
	if (snap.size > 0) {
		logger.info('[studioPlanOutcomeSnapshot] run', { candidates: snap.size, written });
	}

	return written;
}

/** Daily: capture how each AI-built plan actually performed. */
export const studioPlanOutcomeSnapshot = onSchedule(
	{ schedule: '30 3 * * *', timeZone: 'UTC', region: functionConfig.region, timeoutSeconds: 300 },
	async () => {
		try {
			await runOutcomeSnapshots();
		} catch (error) {
			logError(error, { operation: 'studio.plan.outcomeSnapshot.sweep' });
		}
	},
);
