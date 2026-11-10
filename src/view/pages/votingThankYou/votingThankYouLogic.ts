import { Statement, StatementType } from '@freedi/shared-types';
import {
	getQuestionStage,
	STAGE_COLLECTING,
	STAGE_DECIDED,
	STAGE_RATING,
	STAGE_VOTING,
} from '@/helpers/questionStage';

const NEXT_STEP_UNKNOWN = 'thankYou.next.unknown';
const NEXT_STEP_BY_STAGE = {
	[STAGE_COLLECTING]: 'thankYou.next.collecting',
	[STAGE_RATING]: 'thankYou.next.rating',
	[STAGE_VOTING]: 'thankYou.next.voting',
	[STAGE_DECIDED]: 'thankYou.next.decided',
} as const;

export interface NextStepInput {
	statement: Statement | undefined;
	answerCount: number;
	now: number;
}

/** The i18n key saying what happens next. A halted question promises nothing about its pace. */
export function getNextStepKey({ statement, answerCount, now }: NextStepInput): string {
	if (statement?.statementType !== StatementType.question) return NEXT_STEP_UNKNOWN;
	const stage = getQuestionStage({ statement, answerCount, now });
	const deadline = statement.questionSettings?.deadline;
	const isDeadlinePassed = typeof deadline === 'number' && deadline > 0 && deadline <= now;
	const isHalted = statement.questionSettings?.isHalted === true || isDeadlinePassed;
	if (isHalted && stage !== STAGE_DECIDED) return NEXT_STEP_UNKNOWN;

	return NEXT_STEP_BY_STAGE[stage];
}
