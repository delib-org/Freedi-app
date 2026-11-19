import m from 'mithril';
import type { LessonStepKey } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { canGoBackTo } from '@/lib/classroom/nextAction';
import { consoleStepLabel } from '@/lib/classroom/consoleStepLabel';
import { railSteps } from '@/lib/classroom/consoleHelpers';
import type { RailStep } from '@/lib/classroom/consoleHelpers';
import { isBusy } from './consoleState';

/**
 * "All steps" (design 3.2): every step of the lesson. Earlier steps are buttons that go BACK
 * (the caller asks first). The current step and the later ones are plain list items: not
 * buttons, not in the tab order, "later" in words. Forward is only the big button.
 * A disclosure panel: Escape or a tap outside closes it and focus returns to its button.
 */

export interface StepListAttrs {
	keys: readonly LessonStepKey[];
	currentIndex: number;
	held: boolean;
	/** id of the button that opens this list (focus returns to it). */
	toggleId: string;
	onBack: (index: number) => void;
}

const MARK_DONE = '✓';

let open = false;
let onDocumentClick: ((event: MouseEvent) => void) | null = null;

export function stepListOpen(): boolean {
	return open;
}

export function toggleStepList(): void {
	open = !open;
}

export function closeStepList(): void {
	open = false;
}

function closeAndFocus(toggleId: string): void {
	open = false;
	document.getElementById(toggleId)?.focus();
}

function row(step: RailStep, attrs: StepListAttrs): m.Vnode {
	const name = consoleStepLabel(step.key);
	const n = step.index + 1;
	const dot = m(
		'span.step-list__dot',
		{ 'aria-hidden': 'true' },
		step.state === 'done' ? MARK_DONE : String(n),
	);
	if (canGoBackTo(step.index, attrs.currentIndex)) {
		return m(
			'li.step-list__item.step-list__item--done',
			{ key: step.index },
			m(
				'button.step-list__row',
				{
					type: 'button',
					'data-step': step.index,
					'data-step-key': step.key,
					disabled: attrs.held || isBusy(`step:${step.index}`),
					'aria-label': `${t('console.rail_step', { n, name, state: t('console.state_done') })}. ${t('console.step_back_hint')}`,
					onclick: () => {
						closeAndFocus(attrs.toggleId);
						attrs.onBack(step.index);
					},
				},
				[
					dot,
					m('span.step-list__name', { 'aria-hidden': 'true' }, name),
					m('span.step-list__tag.step-list__tag--back', { 'aria-hidden': 'true' }, [
						t('console.step_back_tag'),
						' ',
						m('span.step-list__chevron', '‹'),
					]),
				],
			),
		);
	}
	const current = step.state === 'current';

	return m(
		`li.step-list__item.step-list__item--${current ? 'current' : 'later'}`,
		{ key: step.index, 'aria-current': current ? 'step' : undefined, 'data-step': step.index },
		[
			dot,
			m('span.step-list__name', name),
			m('span.step-list__tag', current ? t('console.step_now') : t('console.state_upcoming')),
		],
	);
}

export const StepList: m.Component<StepListAttrs> = {
	oncreate(vnode) {
		onDocumentClick = (event: MouseEvent) => {
			const target = event.target as Node;
			const toggle = document.getElementById(vnode.attrs.toggleId);
			if (open && !vnode.dom.contains(target) && !toggle?.contains(target)) {
				open = false;
				m.redraw();
			}
		};
		document.addEventListener('click', onDocumentClick);
	},

	onremove() {
		if (onDocumentClick) document.removeEventListener('click', onDocumentClick);
		onDocumentClick = null;
	},

	view({ attrs }) {
		return m(
			'div.step-list#step-list',
			{
				hidden: !open,
				role: 'region',
				'aria-label': t('console.all_steps'),
				onkeydown: (event: KeyboardEvent) => {
					if (event.key === 'Escape') {
						event.stopPropagation();
						closeAndFocus(attrs.toggleId);
					}
				},
			},
			open
				? [
						m(
							'ol.step-list__list',
							{ 'aria-label': t('console.rail_label') },
							railSteps(attrs.keys, attrs.currentIndex).map((step) => row(step, attrs)),
						),
						m('p.step-list__note', t('console.steps_forward_note')),
					]
				: null,
		);
	},
};
