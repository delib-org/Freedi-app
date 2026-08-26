import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	Statement,
	StudioExistingActivitySnapshot,
	StudioPlan,
	StudioPlanMessage,
	StudioPlanSession,
	functionConfig,
	getRandomUID,
} from '@freedi/shared-types';
import { db } from '../../db';
import { logError } from '../../utils/errorHandling';
import { getCallerIdentity } from '../orgInvites';
import { EXISTING_MODE_BOOTSTRAP, openerFor } from './planPrompt';
import { runPlannerTurn } from './plannerTurn';
import {
	LANGUAGE_NAMES,
	assertPlannerAccess,
	isValidTimezone,
	loadExistingActivities,
} from './planSession';

export interface StudioPlanStartRequest {
	organizationId: string;
	topQuestionId?: string;
	language?: string;
	timezone?: string;
}

export interface StudioPlanStartResult {
	sessionId: string;
	message: StudioPlanMessage;
	plan?: StudioPlan;
	existingActivities?: StudioExistingActivitySnapshot[];
}

const DEFAULT_TIMEZONE = 'Asia/Jerusalem';

/** Existing-question mode baseline: every current activity kept as is. */
function keepPlanFor(
	topQuestion: Statement,
	existing: StudioExistingActivitySnapshot[],
	summary: string,
): StudioPlan {
	return {
		mainQuestion: {
			title: topQuestion.statement,
			...(topQuestion.description ? { description: topQuestion.description } : {}),
		},
		activities: existing.map((row, index) => ({
			tempId: `e${index + 1}`,
			type: row.type,
			title: row.title,
			...(row.description ? { description: row.description } : {}),
			order: index,
			openNow: row.status !== 'frozen',
			change: 'keep',
			existingStatementId: row.statementId,
		})),
		scheduledActions: [],
		summary,
	};
}

/**
 * Opens a planning session. New-question mode answers instantly with a
 * localized opener (no LLM call); existing-question mode runs one consultant
 * turn that reads the current activities and proposes a `keep` plan.
 */
export const fn_studioPlanStart = onCall(
	{ region: functionConfig.region, timeoutSeconds: 120 },
	async (request: CallableRequest<StudioPlanStartRequest>): Promise<StudioPlanStartResult> => {
		const caller = getCallerIdentity(request);
		const { organizationId, topQuestionId, language, timezone } = request.data ?? {};
		if (!organizationId || typeof organizationId !== 'string') {
			throw new HttpsError('invalid-argument', 'organizationId is required');
		}
		if (topQuestionId !== undefined && typeof topQuestionId !== 'string') {
			throw new HttpsError('invalid-argument', 'Invalid topQuestionId');
		}

		const access = await assertPlannerAccess(caller.uid, organizationId, topQuestionId);
		const uiLanguage =
			typeof language === 'string' && LANGUAGE_NAMES[language]
				? language
				: access.organization.defaultLanguage && LANGUAGE_NAMES[access.organization.defaultLanguage]
					? access.organization.defaultLanguage
					: 'en';
		const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
		const now = Date.now();
		const sessionId = getRandomUID();

		const session: StudioPlanSession = {
			sessionId,
			organizationId,
			organizationName: access.organization.name,
			createdBy: caller.uid,
			language: uiLanguage,
			uiLanguage,
			timezone: tz,
			status: 'draft',
			messages: [],
			planVersion: 0,
			readyToBuild: false,
			userTurns: 0,
			createdAt: now,
			lastUpdate: now,
		};

		try {
			if (!access.topQuestion) {
				const message: StudioPlanMessage = {
					role: 'assistant',
					content: openerFor(uiLanguage),
					createdAt: now,
				};
				session.messages = [message];
				await db.collection(Collections.studioPlanSessions).doc(sessionId).set(session);

				return { sessionId, message };
			}

			// Existing-question mode: one bootstrap turn (not stored as a user turn).
			session.topQuestionId = access.topQuestion.statementId;
			session.existingActivities = await loadExistingActivities(access.topQuestion.statementId);
			const bootstrap: StudioPlanMessage = {
				role: 'user',
				content: `${EXISTING_MODE_BOOTSTRAP}\nMain question: ${access.topQuestion.statement}`,
				createdAt: now,
			};
			const turn = await runPlannerTurn({ session, messages: [bootstrap], now });
			// The plan card must show the current state from the first turn even
			// when the consultant opens with a question and returns no plan yet.
			const plan =
				turn.plan ?? keepPlanFor(access.topQuestion, session.existingActivities, turn.reply);
			const message: StudioPlanMessage = {
				role: 'assistant',
				content: turn.reply,
				createdAt: Date.now(),
				planVersion: 1,
			};
			session.messages = [message];
			if (turn.diagnosis) session.diagnosis = turn.diagnosis;
			if (turn.patternId) session.patternId = turn.patternId;
			session.currentPlan = plan;
			session.proposedPlan = plan;
			session.planVersion = 1;
			await db.collection(Collections.studioPlanSessions).doc(sessionId).set(session);

			logger.info('[fn_studioPlanStart] existing-mode session opened', {
				sessionId,
				topQuestionId: session.topQuestionId,
				activities: session.existingActivities.length,
			});

			return {
				sessionId,
				message,
				plan,
				existingActivities: session.existingActivities,
			};
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'studio.plan.start',
				userId: caller.uid,
				statementId: topQuestionId,
				metadata: { organizationId, sessionId },
			});
			throw new HttpsError('internal', 'Could not start the consultant');
		}
	},
);
