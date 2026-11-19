import m from 'mithril';
import { t } from '@/lib/i18n';
import { liveResultsOn } from '@/lib/classroom/voteResults';
import { getChallengeQuestion } from '@/lib/lessonCore';
import { getSubQuestions } from '@/lib/store';
import { getLessonStep } from '@/lib/lesson';
import { icon } from './ConsoleIcon';
import { askConfirm } from './ConfirmDialog';
import {
	assignTables,
	closeBallot,
	goToStep,
	resetTurns,
	resetVote,
	setVoteDisplay,
} from './consoleActions';

/**
 * The three questions the console asks before it does something it cannot
 * quietly take back (IA 18.2). Going back keeps all work, so its confirm is
 * only a guard against a mis-tap; the two resets say "cannot be undone".
 */

/** Pressing an EARLIER step in the step list: confirm, then move. Forward is only the big button. */
export function confirmGoBack(mainId: string, index: number, stepName: string): void {
	// A stale call can never move the lesson forward (or stay put).
	if (index >= getLessonStep().index) return;
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

/** "Divide again": the current seating is lost, so it asks in the console's own dialog. */
export function confirmResplit(mainId: string): void {
	askConfirm({
		title: t('console.resplit_title'),
		body: t('console.resplit_body'),
		yesLabel: t('console.resplit'),
		destructive: true,
		run: () => void assignTables(mainId, true),
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
	// No vote was held: there are no results to show or hide.
	if (!challenge?.statementSettings?.ballot) return null;
	if (liveResultsOn(challenge)) {
		return m('p.results-aside', { role: 'status' }, [
			icon('eye'),
			m('span', t('console.results_chip_shown')),
		]);
	}

	return m('p.results-aside', { role: 'status' }, [
		icon('lock'),
		m('span', t('console.close_and_go_results_closed')),
		challenge
			? m(
					'button.results-aside__show',
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
 * "Close the vote" while some students have not voted (design 2.2): closing writes the
 * decision and nobody can vote after it, so the primary asks first, naming how many are
 * left. Cancel has the focus. Moving on to the summary is a separate, later press.
 */
export function confirmCloseVote(mainId: string, notVoted: number): void {
	askConfirm({
		title: t('console.close_vote_title', { n: notVoted }),
		body: t('console.close_and_go_body'),
		yesLabel: t('console.close_vote_yes'),
		destructive: false,
		run: () => void closeBallot(mainId),
	});
}

/**
 * "Go to the summary without a vote": the only way past a vote that never opened, from the
 * Vote step's menu. The big button never skips work silently (IA 5).
 */
export function confirmSkipVote(mainId: string, summaryIndex: number): void {
	askConfirm({
		title: t('console.vote_skip_title'),
		body: t('console.vote_skip_body'),
		yesLabel: t('console.vote_skip_yes'),
		destructive: false,
		run: () => void goToStep(mainId, summaryIndex),
	});
}
// >>> voteSummary END
