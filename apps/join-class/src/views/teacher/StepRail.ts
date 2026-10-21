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
				'aria-current': step.state === 'current' ? 'step' : undefined,
				'aria-label': t('console.rail_step', { n: step.index + 1, name, state }),
				disabled: isBusy(`step:${step.index}`),
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

export const StepRail: m.Component<StepRailAttrs> = {
	view({ attrs }) {
		const steps = railSteps(attrs.keys, attrs.currentIndex);
		const forward = forwardControl(attrs.currentIndex, attrs.keys.length);
		const busy = forward.kind === 'next' && isBusy(`step:${forward.nextIndex}`);
		const label =
			forward.kind === 'end'
				? t('console.end')
				: busy
					? t('console.opening')
					: t('console.next', { name: stepLabel(attrs.keys[forward.nextIndex]) });

		return m('div.step-rail', [
			m(
				'ol.step-rail__list',
				{ 'aria-label': t('console.rail_label') },
				steps.map((s) => stepButton(s, attrs)),
			),
			m('div.step-rail__side', [
				m(
					'button.btn.step-rail__next',
					{
						type: 'button',
						class: forward.kind === 'end' ? 'btn--danger-outline' : 'btn--primary',
						disabled: busy,
						onclick: () => {
							if (forward.kind === 'end') attrs.onEnd();
							else attrs.onGo(forward.nextIndex);
						},
					},
					label,
				),
				m('p.step-rail__status', [
					m('span', t('console.step_of', { n: attrs.currentIndex + 1, total: attrs.keys.length })),
					m('span.step-rail__clock', { dir: 'ltr' }, formatClock(attrs.elapsedMs)),
				]),
			]),
		]);
	},
};
