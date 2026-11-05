import m from 'mithril';
import { t } from '@/lib/i18n';
import { liveResultsOn } from '@/lib/classroom/voteResults';
import { getChallengeQuestion } from '@/lib/lessonCore';
import { getSubQuestions } from '@/lib/store';
import { icon } from './ConsoleIcon';
import { askConfirm } from './ConfirmDialog';
import { closeBallot, goToStep, resetTurns, resetVote, setVoteDisplay } from './consoleActions';

/**
 * The three questions the console asks before it does something it cannot
 * quietly take back (IA 18.2). Going back keeps all work, so its confirm is
 * only a guard against a mis-tap; the two resets say "cannot be undone".
 */

/** Pressing an EARLIER step: confirm, then move. Forward stays one tap. */
export function confirmGoBack(mainId: string, index: number, stepName: string): void {
	askConfirm({
		title: t('console.back_title', { name: stepName }),
		body: t('console.back_keep'),
		yesLabel: t('console.back_yes'),
		destructive: false,
		run: () => void goToStep(mainId, index),
	});
}

/** Reset the turns of table `n`, or of every table without `n`. */
export function confirmResetTurns(mainId: string, n?: number): void {
	askConfirm({
		title: t('console.reset_turns_title'),
		body: t('console.reset_turns_body'),
		yesLabel: t('console.reset_yes'),
		destructive: true,
		run: () => void resetTurns(mainId, n),
	});
}

export function confirmResetVote(mainId: string): void {
	askConfirm({
		title: t('console.reset_vote_title'),
		body: t('console.reset_vote_body'),
		yesLabel: t('console.reset_yes'),
		destructive: true,
		run: () => void resetVote(mainId),
	});
}

// >>> voteSummary BEGIN
/**
 * The small prompt on the close-and-go confirm: closing the ballot does not
 * open the results, so while they are closed it says so, with an inline "show
 * to the class" action; once open it says that instead (Trello uVEcfwbB).
 */
export function resultsAside(): m.Children {
	const challenge = getChallengeQuestion(getSubQuestions());
	if (liveResultsOn(challenge)) {
		return m('p.confirm-dialog__results', { role: 'status' }, [
			icon('eye'),
			m('span', t('console.results_chip_shown')),
		]);
	}

	return m('p.confirm-dialog__results', { role: 'status' }, [
		icon('lock'),
		m('span', t('console.close_and_go_results_closed')),
		challenge
			? m(
					'button.confirm-dialog__show',
					{
						type: 'button',
						'data-testid': 'confirm-show-results',
						onclick: () => void setVoteDisplay(challenge.statementId, 'liveResults', true),
					},
					t('console.close_and_go_show'),
				)
			: null,
	]);
}

/**
 * Moving on from the Vote while the ballot is still open or paused (IA 20.2):
 * the decision is only written when the ballot closes, so closing comes first
 * and the step move follows only if it worked.
 */
export function confirmCloseAndGo(mainId: string, index: number): void {
	askConfirm({
		title: t('console.close_and_go_title'),
		body: t('console.close_and_go_body'),
		yesLabel: t('console.close_and_go_yes'),
		destructive: false,
		aside: resultsAside,
		run: () => {
			void closeBallot(mainId).then((closed) => {
				if (closed) void goToStep(mainId, index);
			});
		},
	});
}
// >>> voteSummary END
