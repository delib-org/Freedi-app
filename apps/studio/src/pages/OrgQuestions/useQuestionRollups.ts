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
	/** The question's own title, when the board shows a different name for it. */
	realTitle?: string;
}

/**
 * Board names for linked questions, keyed by statement id. A question absent
 * from the map is one the organization owns; a present one with no `label`
 * is linked but unnamed, and keeps its own title on the card.
 */
export type ActivityLabels = Record<string, { label?: string }>;

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

		return {
			questionId: question.statementId,
			title: label || question.statement,
			linked: link !== undefined,
			realTitle: label && label !== question.statement ? question.statement : undefined,
			status: questionStatusToRunState(question.statementSettings?.questionStatus),
			progress: {
				entered: own?.entered ?? 0,
				suggested: own?.suggested ?? 0,
				evaluated: own?.evaluated ?? 0,
			},
			memberCount: question.numberOfMembers ?? 0,
			activityCount: activityCounts[question.statementId] ?? 0,
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
