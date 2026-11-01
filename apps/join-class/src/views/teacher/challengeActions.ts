import { setChallengeQuestion } from '@/lib/lesson';
import { t } from '@/lib/i18n';
import { createPlanQuestion } from './planApi';
import { normalizeQuestionText } from './planHelpers';
import { act } from './consoleState';

/**
 * The console's two ways to give a running lesson its Proposals question: mark
 * an existing question (setChallengeQuestion demotes any old one in the same
 * batch), or write a new one with the challenge role. Both go through `act`, so
 * a failure shows the console's inline error with a retry. Students and the
 * projector follow through the sub-question subscription; nothing else to write.
 */

/** Use an existing lesson question as the Proposals question. */
export function setProposalsQuestion(mainId: string, questionId: string): Promise<boolean> {
	return act('challenge:set', t('console.challenge.missing_title'), () =>
		setChallengeQuestion(mainId, questionId),
	);
}

/** Write a new Proposals question. Resolves false for blank text. */
export function addProposalsQuestion(mainId: string, rawText: string): Promise<boolean> {
	const text = normalizeQuestionText(rawText);
	if (!text) return Promise.resolve(false);

	return act('challenge:add', t('console.challenge.missing_title'), () =>
		createPlanQuestion(mainId, text, 'challenge', undefined),
	);
}
