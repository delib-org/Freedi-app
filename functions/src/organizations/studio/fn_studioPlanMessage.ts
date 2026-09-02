import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { plansEqual } from '@freedi/deliberation-brain';
import {
	StudioPlan,
	StudioPlanMessage,
	StudioPlanSession,
	STUDIO_PLAN_MAX_MESSAGE_CHARS,
	STUDIO_PLAN_MAX_USER_TURNS,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../../utils/errorHandling';
import { getCallerIdentity } from '../orgInvites';
import { runPlannerTurn } from './plannerTurn';
import { loadSessionForCaller, reservePlannerMessageSlot, resolveLanguage } from './planSession';

export interface StudioPlanMessageRequest {
	sessionId: string;
	message: string;
}

export interface StudioPlanMessageResult {
	message: StudioPlanMessage;
	plan?: StudioPlan;
	planVersion: number;
	readyToBuild: boolean;
	problems?: string[];
}

/**
 * One chat turn with the consultant: append the admin's message, run the
 * planner, store the reply + revised plan on the session.
 */
export const fn_studioPlanMessage = onCall(
	{ region: functionConfig.region, timeoutSeconds: 120, memory: '512MiB' },
	async (request: CallableRequest<StudioPlanMessageRequest>): Promise<StudioPlanMessageResult> => {
		const caller = getCallerIdentity(request);
		const { sessionId, message } = request.data ?? {};
		const text = typeof message === 'string' ? message.trim() : '';
		if (text.length < 1 || text.length > STUDIO_PLAN_MAX_MESSAGE_CHARS) {
			throw new HttpsError(
				'invalid-argument',
				`message must be between 1 and ${STUDIO_PLAN_MAX_MESSAGE_CHARS} characters`,
			);
		}
		const { ref, session } = await loadSessionForCaller(sessionId, caller.uid);
		if (session.status !== 'draft' && session.status !== 'ready') {
			throw new HttpsError('failed-precondition', 'This plan is no longer editable');
		}
		if (session.userTurns >= STUDIO_PLAN_MAX_USER_TURNS) {
			throw new HttpsError('resource-exhausted', 'This conversation reached its length limit');
		}
		const now = Date.now();
		await reservePlannerMessageSlot(caller.uid, now);

		const language = resolveLanguage(text, session.language);
		const userMessage: StudioPlanMessage = { role: 'user', content: text, createdAt: now };
		const messages = [...session.messages, userMessage];
		const working: StudioPlanSession = { ...session, language, messages };

		try {
			const turn = await runPlannerTurn({ session: working, messages, now });
			const planChanged = turn.plan !== undefined && !plansEqual(session.currentPlan, turn.plan);
			const planVersion = planChanged ? session.planVersion + 1 : session.planVersion;
			const currentPlan = turn.plan ?? session.currentPlan;
			const readyToBuild = turn.readyToBuild && !!currentPlan && !turn.blocking;
			const reply: StudioPlanMessage = {
				role: 'assistant',
				content: turn.reply,
				createdAt: Date.now(),
				planVersion,
			};

			const patch: Partial<StudioPlanSession> = {
				language,
				messages: [...messages, reply],
				planVersion,
				readyToBuild,
				status: readyToBuild ? 'ready' : 'draft',
				userTurns: session.userTurns + 1,
				lastUpdate: reply.createdAt,
			};
			if (currentPlan) {
				patch.currentPlan = currentPlan;
				patch.proposedPlan = currentPlan;
			}
			if (turn.diagnosis) patch.diagnosis = turn.diagnosis;
			if (turn.patternId) patch.patternId = turn.patternId;
			await ref.update(patch);

			logger.info('[fn_studioPlanMessage] turn', {
				sessionId,
				turn: session.userTurns + 1,
				planChanged,
				readyToBuild,
				problems: turn.problems.length,
			});

			return {
				message: reply,
				plan: currentPlan,
				planVersion,
				readyToBuild,
				...(turn.problems.length > 0 ? { problems: turn.problems } : {}),
			};
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'studio.plan.message',
				userId: caller.uid,
				metadata: { sessionId, organizationId: session.organizationId, turn: session.userTurns },
			});
			throw new HttpsError('internal', 'The consultant could not answer');
		}
	},
);
