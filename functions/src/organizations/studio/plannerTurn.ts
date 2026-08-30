import {
	PlanParseError,
	buildFixtureResponse,
	interpretLlmResponse,
	nextMove,
	renderSystemPrompt,
	renderTurnContext,
	type InterpretedResponse,
} from '@freedi/deliberation-brain';
import { StudioPlanMessage, StudioPlanSession } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import {
	TAXONOMY_MODEL,
	callLLMChat,
	extractJson,
	type ChatMessage,
} from '../../config/openai-chat';
import { brainContextFor, buildHistory } from './planPrompt';
import { isFixtureMode } from './planSession';

/** Heavy tier by default: low volume, quality and date reasoning matter. */
export const PLANNER_MODEL = process.env.OPENAI_STUDIO_PLANNER_MODEL || TAXONOMY_MODEL;
const PLANNER_MAX_TOKENS = 3500;
const PLANNER_TEMPERATURE = 0.5;

export interface PlannerTurnInput {
	session: StudioPlanSession;
	/** Conversation including the user's latest message (last element). */
	messages: StudioPlanMessage[];
	now: number;
}

function existingIdsOf(session: StudioPlanSession): string[] {
	return (session.existingActivities ?? []).map((a) => a.statementId);
}

function parseJson(raw: string): unknown {
	return JSON.parse(extractJson(raw)) as unknown;
}

/**
 * One consultant turn: render prompt → LLM → interpret. At most two model
 * calls: a repair round runs when the JSON is invalid or the critic finds a
 * blocking problem. Fixture mode (no API key) is deterministic.
 */
export async function runPlannerTurn(input: PlannerTurnInput): Promise<InterpretedResponse> {
	const { session, messages, now } = input;
	const latest = messages[messages.length - 1];
	const ctx = brainContextFor(session, { now });
	const move = nextMove(ctx);
	const interpretOpts = {
		mode: ctx.mode,
		existingIds: existingIdsOf(session),
		now,
		previousPlan: session.currentPlan,
		previousDiagnosis: session.diagnosis,
		timezone: session.timezone,
	};

	if (isFixtureMode()) {
		const fixture = buildFixtureResponse(ctx, latest?.content ?? '');

		return {
			reply: fixture.reply,
			readyToBuild: fixture.readyToBuild,
			diagnosis: fixture.diagnosis,
			patternId: fixture.patternId,
			missingCritical: [],
			plan: fixture.plan,
			problems: [],
			blocking: false,
		};
	}

	const history = buildHistory(renderSystemPrompt(ctx), messages, renderTurnContext(ctx, move));
	const call = (extra: ChatMessage[]): Promise<string> =>
		callLLMChat({
			model: PLANNER_MODEL,
			messages: [...history, ...extra],
			maxTokens: PLANNER_MAX_TOKENS,
			temperature: PLANNER_TEMPERATURE,
			jsonMode: true,
		});

	const first = await call([]);
	let repairPrompt: string | undefined;
	let result: InterpretedResponse | undefined;
	try {
		result = interpretLlmResponse(parseJson(first), interpretOpts);
		if (result.blocking && result.plan) {
			repairPrompt = `The plan has problems that must be fixed before it can be built:\n- ${result.problems.join('\n- ')}\nReturn the corrected COMPLETE JSON only, same reply.`;
		}
	} catch (error) {
		const issues =
			error instanceof PlanParseError
				? error.issues.join('; ')
				: error instanceof Error
					? error.message
					: String(error);
		repairPrompt = `Your JSON was invalid: ${issues}. Return the corrected JSON only, following the contract exactly.`;
	}

	if (repairPrompt) {
		logger.info('[studioPlanner] repair round', { sessionId: session.sessionId, move: move.move });
		const second = await call([
			{ role: 'assistant', content: first },
			{ role: 'user', content: repairPrompt },
		]);
		try {
			result = interpretLlmResponse(parseJson(second), interpretOpts);
		} catch (error) {
			if (!result) throw error;
		}
	}
	if (!result) {
		throw new Error('Planner produced no interpretable response');
	}

	return result;
}
