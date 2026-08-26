import {
	StudioPlanMessage,
	StudioPlanSession,
	STUDIO_PLAN_MAX_MESSAGE_CHARS,
} from '@freedi/shared-types';
import type { BrainContext } from '@freedi/deliberation-brain';
import type { ChatMessage } from '../../config/openai-chat';
import { languageName, todayIsoInTimezone } from './planSession';

/**
 * Adapter between a stored plan session and `@freedi/deliberation-brain`,
 * which owns the prompt content. This file only maps session → BrainContext
 * and shapes the chat history the model sees.
 */

/** Recent turns kept verbatim; older ones are summarized by the marker line. */
const HISTORY_WINDOW = 16;
const TRUNCATION_MARKER = '[earlier turns omitted]';

/** Opening line for a new session, by UI/org language (no LLM call). */
export const OPENERS: Record<string, string> = {
	en: 'Tell me about the problem you want to bring to the public — who is affected, what decision is needed, and by when. Write in any language.',
	he: 'ספרו לי על הבעיה שאתם רוצים להביא לציבור — מי מושפע ממנה, איזו החלטה נדרשת, ועד מתי. אפשר לכתוב בכל שפה.',
	ar: 'أخبرني عن المشكلة التي تريد طرحها على الجمهور — من المتأثرون، ما القرار المطلوب، ومتى. اكتب بأي لغة.',
};

export function openerFor(language: string): string {
	return OPENERS[language] ?? OPENERS.en;
}

export const EXISTING_MODE_BOOTSTRAP =
	'Here is my main question with its current activities. Briefly summarize what is already running, and suggest what could be added or improved. Keep every existing activity with change "keep".';

export function brainContextFor(
	session: StudioPlanSession,
	opts: { now: number; problems?: string[] },
): BrainContext {
	const ctx: BrainContext = {
		mode: session.topQuestionId ? 'existing' : 'new',
		languageName: languageName(session.language),
		todayIso: todayIsoInTimezone(opts.now, session.timezone),
		timezone: session.timezone,
		organizationName: session.organizationName,
		userTurns: session.userTurns,
	};
	if (session.existingActivities) ctx.existingActivities = session.existingActivities;
	if (session.diagnosis) ctx.diagnosis = session.diagnosis;
	if (session.currentPlan) ctx.currentPlan = session.currentPlan;
	if (session.patternId) ctx.patternId = session.patternId;
	if (opts.problems && opts.problems.length > 0) ctx.problems = opts.problems;

	return ctx;
}

function toChat(message: StudioPlanMessage): ChatMessage {
	return {
		role: message.role,
		content: message.content.slice(0, STUDIO_PLAN_MAX_MESSAGE_CHARS),
	};
}

/**
 * system → first user turn (the original problem statement) → marker when
 * truncated → last HISTORY_WINDOW turns → turn context → latest user turn.
 * `messages` must already end with the user's latest message.
 */
export function buildHistory(
	systemPrompt: string,
	messages: StudioPlanMessage[],
	turnContext: string,
): ChatMessage[] {
	const history: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
	if (messages.length === 0) return history;

	const latest = messages[messages.length - 1];
	const earlier = messages.slice(0, -1);
	const firstUserIndex = earlier.findIndex((m) => m.role === 'user');
	const recentStart = Math.max(0, earlier.length - HISTORY_WINDOW);

	if (firstUserIndex >= 0 && firstUserIndex < recentStart) {
		history.push(toChat(earlier[firstUserIndex]));
		history.push({ role: 'user', content: TRUNCATION_MARKER });
	}
	earlier.slice(recentStart).forEach((m) => history.push(toChat(m)));
	history.push({ role: 'user', content: turnContext });
	history.push(toChat(latest));

	return history;
}
