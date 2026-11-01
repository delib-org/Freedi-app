import m from 'mithril';
import type { LessonStepKey } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { stepLabel } from '@/lib/lesson';
import { forwardControl, formatClock, railSteps } from '@/lib/classroom/consoleHelpers';
import type { RailStep } from '@/lib/classroom/consoleHelpers';
import { isBusy } from './consoleState';

/**
 * The step rail (UX section 5 + 11): eight steps as buttons in an ordered
 * list, the one forward control at the end, "step n of 8" and the lesson clock.
 * Props in, callbacks out; the writes live in consoleActions.ts.
 */

export interface StepRailAttrs {
	keys: readonly LessonStepKey[];
	currentIndex: number;
	elapsedMs: number;
	/** Paused or ended: every step button and the forward control are held. */
	held?: boolean;
	/** i18n key of the words that replace "step n of 8" while held. */
	heldKey?: string;
	onGo: (index: number) => void;
	onEnd: () => void;
}

const MARK_DONE = '✓';

function stepButton(step: RailStep, attrs: StepRailAttrs): m.Vnode {
	const name = stepLabel(step.key);
	const state = t(`console.state_${step.state}`);

	return m(
		'li.step-rail__item',
		m(
			`button.step-rail__step.step-rail__step--${step.state}`,
			{
				type: 'button',
				'data-step': step.index,
				'data-step-key': step.key,
				'aria-current': step.state === 'current' ? 'step' : undefined,
				'aria-label': t('console.rail_step', { n: step.index + 1, name, state }),
				disabled: attrs.held === true || isBusy(`step:${step.index}`),
				onclick: () => {
					if (step.state !== 'current') attrs.onGo(step.index);
				},
			},
			[
				m(
					'span.step-rail__dot',
					{ 'aria-hidden': 'true' },
					step.state === 'done' ? MARK_DONE : String(step.index + 1),
				),
				m('span.step-rail__name', { 'aria-hidden': 'true' }, name),
			],
		),
	);
}

/**
 * On a phone the step strip scrolls inside itself: keep the current step in the
 * middle of it. Scrolls the strip only (never the page) and only when it overflows.
 */
function centreCurrentStep(vnode: m.VnodeDOM): void {
	const list = vnode.dom as HTMLElement;
	if (list.scrollWidth <= list.clientWidth) return;
	const current = list.querySelector<HTMLElement>('.step-rail__step--current');
	if (!current) return;
	const listBox = list.getBoundingClientRect();
	const box = current.getBoundingClientRect();
	list.scrollLeft += box.left + box.width / 2 - (listBox.left + listBox.width / 2);
}

export const StepRail: m.Component<StepRailAttrs> = {
	view({ attrs }) {
		const steps = railSteps(attrs.keys, attrs.currentIndex);
		const forward = forwardControl(attrs.currentIndex, attrs.keys.length);
		const busy = forward.kind === 'next' && isBusy(`step:${forward.nextIndex}`);
		const label =
			forward.kind === 'end'
				? t('console.end')
				: busy
					? t('console.busy_opening')
					: t('console.next', { name: stepLabel(attrs.keys[forward.nextIndex]) });

		return m('div.step-rail', { class: attrs.held ? 'step-rail--held' : '' }, [
			m(
				'ol.step-rail__list',
				{
					'aria-label': t('console.rail_label'),
					oncreate: centreCurrentStep,
					// only when the step changed: a manual swipe must not be undone by the clock tick
					onupdate: (v: m.VnodeDOM) => {
						const key = String(attrs.currentIndex);
						if ((v.dom as HTMLElement).dataset.centred === key) return;
						(v.dom as HTMLElement).dataset.centred = key;
						centreCurrentStep(v);
					},
				},
				steps.map((s) => stepButton(s, attrs)),
			),
			m('div.step-rail__side', [
				m(
					'button.btn.step-rail__next',
					{
						type: 'button',
						'data-testid': 'console-forward',
						class: forward.kind === 'end' ? 'btn--danger-outline' : 'btn--primary',
						disabled: busy || attrs.held === true,
						onclick: () => {
							if (forward.kind === 'end') attrs.onEnd();
							else attrs.onGo(forward.nextIndex);
						},
					},
					label,
				),
				m('p.step-rail__status', [
					m(
						'span',
						attrs.held && attrs.heldKey
							? t(attrs.heldKey)
							: t('console.step_of', { n: attrs.currentIndex + 1, total: attrs.keys.length }),
					),
					m('span.step-rail__clock', { dir: 'ltr' }, formatClock(attrs.elapsedMs)),
				]),
			]),
		]);
	},
};
