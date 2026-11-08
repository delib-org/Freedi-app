import { useMemo } from 'react';
import type { Statement } from '@freedi/shared-types';
import type { ActivityRunState } from '@freedi/event-core';
import type { ActivityType } from '@freedi/shared-types';
import type { ProgressMap } from '@/db/progress';
import type { ProgressCounts } from '@/components/atomic/atoms/ProgressFunnel';
import { questionStatusToRunState } from '@/db/statements';

/**
 * Per-card roll-up of a top question, computed from the org-wide
 * `questionProgress` map (one listener) instead of a children listener per
 * question. Engines stay empty until Phase 3.
 */
export interface QuestionRollup {
	questionId: string;
	title: string;
	status: ActivityRunState;
	progress: ProgressCounts;
	memberCount: number;
	activityCount: number;
	engines: ActivityType[];
	lastActivityAt?: number;
	/** True when the question was added from elsewhere rather than created here. */
	linked?: boolean;
	/** True for a linked crowd survey, whose funnel counts answers, not suggestions. */
	isSurvey?: boolean;
	/** The question's own title, when the board shows a different name for it. */
	realTitle?: string;
}

/**
 * What the board knows about a linked question, keyed by statement id. A
 * question absent from the map is one the organization owns; a present one
 * with no `label` is linked but unnamed, and keeps its own title on the card.
 */
export interface LinkedCardInfo {
	label?: string;
	/**
	 * The questions the link covers. A linked question's own progress record is
	 * keyed by its statement id, not by this card, so the funnel has to be summed
	 * over these rather than read off `progress[cardId]`.
	 */
	questionIds?: string[];
	/** Participation as Mass Consensus counts it, for a linked crowd survey. */
	surveyStats?: { entered: number; responded: number; completed: number };
}

export type ActivityLabels = Record<string, LinkedCardInfo>;

/** Sum the funnel across the questions a link covers. */
function sumOwnProgress(
	questionIds: string[],
	progress: ProgressMap,
): { entered: number; suggested: number; evaluated: number } {
	return questionIds.reduce(
		(acc, id) => {
			const record = progress[id];
			if (!record) return acc;

			return {
				entered: acc.entered + record.entered,
				suggested: acc.suggested + record.suggested,
				evaluated: acc.evaluated + record.evaluated,
			};
		},
		{ entered: 0, suggested: 0, evaluated: 0 },
	);
}

export function computeQuestionRollups(
	questions: Statement[],
	progress: ProgressMap,
	labels: ActivityLabels = {},
): QuestionRollup[] {
	const records = Object.values(progress);
	const activityCounts = records.reduce<Record<string, number>>((acc, record) => {
		if (record.topParentId !== record.statementId) {
			acc[record.topParentId] = (acc[record.topParentId] ?? 0) + 1;
		}

		return acc;
	}, {});

	return questions.map((question) => {
		const own = progress[question.statementId];
		const lastActivityAt =
			own?.lastActivity || question.lastChildUpdate || question.lastUpdate || undefined;
		const link = labels[question.statementId];
		const label = link?.label?.trim();
		// A crowd survey reports its own participation: someone who answers
		// through the survey flow leaves no per-statement trail for the funnel to
		// count, so the question's counters would read as nobody having answered.
		const counts = link?.surveyStats
			? {
					entered: link.surveyStats.entered,
					suggested: link.surveyStats.responded,
					evaluated: link.surveyStats.completed,
				}
			: link?.questionIds
				? sumOwnProgress(link.questionIds, progress)
				: {
						entered: own?.entered ?? 0,
						suggested: own?.suggested ?? 0,
						evaluated: own?.evaluated ?? 0,
					};

		return {
			questionId: question.statementId,
			title: label || question.statement,
			linked: link !== undefined,
			isSurvey: Boolean(link?.surveyStats),
			realTitle: label && label !== question.statement ? question.statement : undefined,
			status: questionStatusToRunState(question.statementSettings?.questionStatus),
			progress: counts,
			memberCount: question.numberOfMembers ?? 0,
			// A linked survey is one activity — itself — not a count of children
			// it does not have.
			activityCount: link?.surveyStats ? 1 : (activityCounts[question.statementId] ?? 0),
			engines: [],
			lastActivityAt,
		};
	});
}

export function useQuestionRollups(
	questions: Statement[],
	progress: ProgressMap,
	labels?: ActivityLabels,
): QuestionRollup[] {
	return useMemo(
		() => computeQuestionRollups(questions, progress, labels),
		[questions, progress, labels],
	);
}
