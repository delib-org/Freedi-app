import m from 'mithril';
import type { LessonStepKey } from '@freedi/shared-types';
import { isRTL, t } from '@/lib/i18n';
import { consoleStepLabel } from '@/lib/classroom/consoleStepLabel';
import { formatClock, railSteps } from '@/lib/classroom/consoleHelpers';
import { StepList, closeStepList, stepListOpen, toggleStepList } from './StepList';

/**
 * "Where we are" (design 3.1): "step 5 of 9: Investigation questions", the lesson clock and
 * "All steps", which opens the list of steps. The list is used to go BACK; moving forward is
 * only the big button. Props in, callbacks out; the writes live in consoleActions.ts.
 */

export interface StepLineAttrs {
	keys: readonly LessonStepKey[];
	currentIndex: number;
	elapsedMs: number;
	/** Paused or ended: the list opens read-only. */
	held?: boolean;
	/** i18n key of the words that replace "step n of 9" while held. */
	heldKey?: string;
	/** An earlier step was chosen (the caller asks first). */
	onBack: (index: number) => void;
}

const TOGGLE_ID = 'step-line-toggle';

function dots(attrs: StepLineAttrs): m.Vnode {
	return m(
		'ol.step-line__dots',
		{ 'aria-hidden': 'true' },
		railSteps(attrs.keys, attrs.currentIndex).map((step) =>
			m('li.step-line__dot', { key: step.index, class: `step-line__dot--${step.state}` }),
		),
	);
}

export const StepLine: m.Component<StepLineAttrs> = {
	onremove: closeStepList,

	view({ attrs }) {
		const name = consoleStepLabel(attrs.keys[attrs.currentIndex]);
		const text =
			attrs.held && attrs.heldKey
				? t(attrs.heldKey)
				: t('console.step_of', { n: attrs.currentIndex + 1, total: attrs.keys.length });
		const open = stepListOpen();

		return m('div.step-line', { class: attrs.held ? 'step-line--held' : '' }, [
			m(
				'button.step-line__toggle',
				{
					id: TOGGLE_ID,
					type: 'button',
					'aria-expanded': open ? 'true' : 'false',
					'aria-controls': 'step-list',
					'data-testid': 'console-all-steps',
					onclick: toggleStepList,
					onkeydown: (event: KeyboardEvent) => {
						if (event.key === 'Escape' && stepListOpen()) closeStepList();
					},
				},
				[
					// Its own direction (the language's) and the name isolated: the colon stays beside "9",
					// not on the far side of the name ("Step 6 of 9 :Proposals").
					m('span.step-line__label', { dir: isRTL() ? 'rtl' : 'ltr' }, [
						attrs.held && attrs.heldKey ? text : `${text}: `,
						attrs.held && attrs.heldKey ? null : m('bdi.step-line__name', name),
					]),
					m('span.step-line__all', t('console.all_steps')),
					m('span.step-line__caret', { 'aria-hidden': 'true' }, '▾'),
				],
			),
			m('span.step-line__clock', { dir: 'ltr' }, formatClock(attrs.elapsedMs)),
			dots(attrs),
			m(StepList, {
				keys: attrs.keys,
				currentIndex: attrs.currentIndex,
				held: attrs.held === true,
				toggleId: TOGGLE_ID,
				onBack: attrs.onBack,
			}),
		]);
	},
};
