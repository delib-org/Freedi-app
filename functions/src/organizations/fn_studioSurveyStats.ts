import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import { Collections, OrganizationRole, functionConfig } from '@freedi/shared-types';
import { db } from '../db';
import { requireOrgRole } from './orgAuth';
import { getCallerIdentity } from './orgInvites';

/**
 * How many people took part in a Mass-Consensus survey.
 *
 * Studio's own participation counters are built for questions it created, and
 * they miss a survey entirely: a person who answers through the survey flow
 * leaves a `surveyProgress` record, not the per-statement trail the funnel
 * counts. A survey linked onto a board therefore reads as nobody having
 * answered, however busy it is.
 *
 * These are the numbers Mass Consensus itself reports, computed the same way
 * (`surveyStats.ts`), so a consultant sees one truth in both places. Live
 * rather than cached: a copy on the link record would be stale by the time
 * anyone read it. Clients cannot reach `surveyProgress` directly — it has no
 * rule — which is why this is a callable.
 */

interface SurveyStatsRequest {
	organizationId: string;
	surveyIds: string[];
}

export interface StudioSurveyStats {
	/** Everyone who opened the survey. */
	entered: number;
	/** Those who got somewhere in it — the number MC calls responses. */
	responded: number;
	/** Those who reached the end. */
	completed: number;
}

type SurveyStatsResult = Record<string, StudioSurveyStats>;

/** Firestore caps an `in` filter at 30 values. */
const IN_CHUNK = 30;

/** At most this many surveys per call — a board does not hold more. */
const MAX_SURVEYS = 60;

/**
 * Landing on a survey is not answering it. Mirrors `hasFlowEngagement` in
 * `apps/mass-consensus/src/lib/firebase/surveys/surveyStats.ts`; the two must
 * agree, or Studio and MC will report different numbers for the same survey.
 */
function hasFlowEngagement(data: DocumentData): boolean {
	return (
		data.isCompleted === true ||
		(Array.isArray(data.completedQuestionIds) && data.completedQuestionIds.length > 0) ||
		(Array.isArray(data.completedDemographicPageIds) &&
			data.completedDemographicPageIds.length > 0) ||
		(typeof data.currentQuestionIndex === 'number' && data.currentQuestionIndex > 0) ||
		(typeof data.currentFlowIndex === 'number' && data.currentFlowIndex > 0) ||
		data.hasViewedOpeningSlide === true
	);
}

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));

	return out;
}

export const fn_studioSurveyStats = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<SurveyStatsRequest>): Promise<SurveyStatsResult> => {
		const caller = getCallerIdentity(request);
		const { organizationId, surveyIds } = request.data ?? {};

		if (!organizationId || typeof organizationId !== 'string') {
			throw new HttpsError('invalid-argument', 'organizationId is required');
		}
		if (!Array.isArray(surveyIds) || surveyIds.some((id) => typeof id !== 'string')) {
			throw new HttpsError('invalid-argument', 'surveyIds must be an array of ids');
		}
		if (surveyIds.length > MAX_SURVEYS) {
			throw new HttpsError('invalid-argument', 'Too many surveys in one request');
		}

		await requireOrgRole(caller.uid, organizationId, [
			OrganizationRole.owner,
			OrganizationRole.admin,
		]);

		const wanted = Array.from(new Set(surveyIds)).filter(Boolean);
		if (wanted.length === 0) return {};

		// Only surveys this organization actually put on its board — the caller
		// may not read the participation of any survey whose id they can guess.
		const links = await db
			.collection(Collections.organizationActivities)
			.where('organizationId', '==', organizationId)
			.get();
		const allowed = new Set(
			links.docs.map((doc) => doc.data().surveyId).filter((id): id is string => Boolean(id)),
		);
		const ids = wanted.filter((id) => allowed.has(id));

		const stats: SurveyStatsResult = {};
		ids.forEach((id) => {
			stats[id] = { entered: 0, responded: 0, completed: 0 };
		});
		if (ids.length === 0) return stats;

		await Promise.all(
			chunk(ids, IN_CHUNK).map(async (group) => {
				const snap = await db
					.collection(Collections.surveyProgress)
					.where('surveyId', 'in', group)
					.get();
				snap.docs.forEach((doc) => {
					const data = doc.data();
					// Test runs are excluded, as they are in the MC admin screens.
					if (data.isTestData === true) return;
					const bucket = stats[data.surveyId as string];
					if (!bucket) return;
					bucket.entered += 1;
					if (hasFlowEngagement(data)) bucket.responded += 1;
					if (data.isCompleted === true) bucket.completed += 1;
				});
			}),
		);

		return stats;
	},
);
