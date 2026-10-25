import { t } from '@/lib/i18n';
import { askConfirm } from './ConfirmDialog';
import { goToStep, resetTurns, resetVote } from './consoleActions';

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
