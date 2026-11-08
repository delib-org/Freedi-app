import m from 'mithril';
import { AgoraStage } from '@freedi/shared-types';
import { t } from '../../../lib/i18n';
import { Icon } from '../../../components/Icon';
import type { AddChoice } from '../../../lib/flows/stagePlanEditor';
import { choiceDescription, choiceLabel, choiceTone } from './stepMeta';

export interface AddStepSheetAttrs {
	choices: readonly AddChoice[];
	/** The step the new one goes after: its number and name */
	after: { n: number; name: string };
	onPick: (choice: AddChoice) => void;
	onClose: () => void;
}

/**
 * "Which step to add?" as a bottom sheet: every step that can go HERE, each
 * with a line saying what students do in it. Question types first — they are
 * what a teacher adds most — then the remaining single-instance steps.
 *
 * Reuses the `.look-sheet` frame and scrim, like VillageMoreSheet. Escape is
 * heard on the document; Tab is kept inside; focus returns to the opener.
 */
export const AddStepSheet: m.Component<
	AddStepSheetAttrs,
	{ returnFocus: HTMLElement | null; onClose: () => void; onKey: (event: KeyboardEvent) => void }
> = {
	oninit(vnode) {
		vnode.state.returnFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		vnode.state.onClose = vnode.attrs.onClose;
		vnode.state.onKey = (event: KeyboardEvent): void => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			vnode.state.onClose();
			m.redraw();
		};
		document.addEventListener('keydown', vnode.state.onKey);
	},
	onbeforeupdate(vnode) {
		vnode.state.onClose = vnode.attrs.onClose;
	},
	onremove(vnode) {
		document.removeEventListener('keydown', vnode.state.onKey);
		// Picking a question hands focus to its words field; anything else goes back to the opener
		queueMicrotask(() => {
			if (document.activeElement === document.body && vnode.state.returnFocus?.isConnected) {
				vnode.state.returnFocus.focus();
			}
		});
	},
	view({ attrs }) {
		const { choices, after, onPick, onClose } = attrs;
		const questions = choices.filter((choice) => choice.stage === AgoraStage.question);
		const others = choices.filter((choice) => choice.stage !== AgoraStage.question);

		const option = (choice: AddChoice): m.Children =>
			m(
				'li',
				{ key: `${choice.stage}-${choice.questionKind ?? ''}` },
				m(
					'button.step-sheet__option',
					{
						type: 'button',
						class: `step-sheet__option--${choiceTone(choice)}`,
						onclick: () => onPick(choice),
					},
					[
						m('span.step-sheet__dot', { 'aria-hidden': 'true' }),
						m('span.step-sheet__text', [
							m('span.step-sheet__name', choiceLabel(choice)),
							m('span.step-sheet__desc', choiceDescription(choice)),
						]),
						m(
							'span.step-sheet__go',
							{ 'aria-hidden': 'true' },
							m(Icon, { name: 'plus', size: 18 }),
						),
					],
				),
			);

		const group = (title: string, list: readonly AddChoice[]): m.Children =>
			list.length === 0
				? null
				: m('section.step-sheet__group', [
						m('h3.step-sheet__group-title', title),
						m('ul.step-sheet__list', list.map(option)),
					]);

		return m(
			'.look-sheet.step-sheet',
			{
				onclick: (event: MouseEvent) => {
					if (event.target === event.currentTarget) onClose();
				},
				onkeydown: (event: KeyboardEvent) => {
					if (event.key !== 'Tab') return;
					const buttons = (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(
						'button:not(:disabled)',
					);
					const first = buttons[0];
					const last = buttons[buttons.length - 1];
					if (event.shiftKey && document.activeElement === first) {
						event.preventDefault();
						last?.focus();
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault();
						first?.focus();
					}
				},
			},
			m(
				'.look-sheet__panel.step-sheet__panel',
				{ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'step-sheet-title' },
				[
					m('.step-sheet__grip', { 'aria-hidden': 'true' }),
					m('.look-sheet__head', [
						m('h2.step-sheet__title#step-sheet-title', t('planb.add_title')),
						m(
							'button.step-sheet__close',
							{
								type: 'button',
								'aria-label': t('planb.close'),
								oncreate: (node: m.VnodeDOM) => (node.dom as HTMLElement).focus(),
								onclick: onClose,
							},
							'✕',
						),
					]),
					m('p.step-sheet__where', t('planb.add_where', { n: after.n, name: after.name })),
					choices.length === 0
						? m('p.step-sheet__empty', t('planb.add_none'))
						: [
								group(t('planb.add_group_question'), questions),
								group(t('planb.add_group_steps'), others),
							],
				],
			),
		);
	},
};
