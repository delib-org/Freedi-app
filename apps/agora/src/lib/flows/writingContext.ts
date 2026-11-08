import { AgoraStage, resolveStagePlan, type StagePlanSession } from '@freedi/shared-types';
import type { QuestionRef } from './moderationQueue';

/** Characters of a proposal's words quoted in a divider */
export const QUOTE_MAX = 48;

/**
 * Where the plan put the question stages and the square, so the teacher's
 * "what they wrote" view can say which stage a line belongs to.
 */
export function planContext(session: StagePlanSession): {
	questions: QuestionRef[];
	squareOrder: number | undefined;
} {
	const questions: QuestionRef[] = [];
	let squareOrder: number | undefined;
	resolveStagePlan(session).forEach((item, order) => {
		if (item.stage === AgoraStage.question && item.statementId) {
			questions.push({
				id: item.statementId,
				title: (item.title ?? '').trim(),
				number: questions.length + 1,
				order,
			});
		} else if (item.stage === AgoraStage.deliberation && squareOrder === undefined) {
			squareOrder = order;
		}
	});

	return { questions, squareOrder };
}

/** A line of someone's words cut to a quotable length */
export function quote(text: string, max: number = QUOTE_MAX): string {
	const flat = text.replace(/\s+/g, ' ').trim();

	return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
