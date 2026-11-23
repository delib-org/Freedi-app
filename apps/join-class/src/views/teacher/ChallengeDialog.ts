import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { ChallengeNeeded } from './ChallengeNeeded';

/**
 * "Choose the question to solve", as a dialog (Trello Rkrtmmx8): at step 1 the big button opens
 * it instead of scrolling to a box. A native <dialog>, so focus is trapped, Escape closes it and
 * focus returns to the button that opened it. It closes by itself once the lesson has a question.
 */

export interface ChallengeDialogAttrs {
	mainId: string;
	candidates: readonly Statement[];
	/** The lesson has its question now: the dialog has done its work. */
	hasChallenge: boolean;
}

let open = false;

export function openChallengeDialog(): void {
	open = true;
	m.redraw();
}

export function isChallengeDialogOpen(): boolean {
	return open;
}

function close(): void {
	open = false;
	m.redraw();
}

function sync(dom: HTMLDialogElement, shown: boolean): void {
	if (shown && !dom.open) dom.showModal();
	else if (!shown && dom.open) dom.close();
}

export const ChallengeDialog: m.Component<ChallengeDialogAttrs> = {
	oncreate(vnode) {
		sync(vnode.dom as HTMLDialogElement, open && !vnode.attrs.hasChallenge);
	},
	onupdate(vnode) {
		if (vnode.attrs.hasChallenge) open = false;
		sync(vnode.dom as HTMLDialogElement, open);
	},
	view({ attrs }) {
		const shown = open && !attrs.hasChallenge;

		return m(
			'dialog.question-dialog',
			{
				'aria-labelledby': 'question-dialog-title',
				'data-testid': 'question-dialog',
				oncancel: (event: Event) => {
					event.preventDefault();
					close();
				},
				onclose: () => {
					if (open) close();
				},
			},
			shown
				? [
						m('header.question-dialog__header', [
							m(
								'h2.question-dialog__title#question-dialog-title',
								t('console.challenge.pick_label'),
							),
							m(
								'button.btn.btn--secondary.btn--small.question-dialog__close',
								{ type: 'button', 'data-testid': 'question-dialog-close', onclick: close },
								t('console.challenge.dialog_close'),
							),
						]),
						m(ChallengeNeeded, {
							mainId: attrs.mainId,
							started: false,
							candidates: attrs.candidates,
							dialog: true,
						}),
					]
				: null,
		);
	},
};
