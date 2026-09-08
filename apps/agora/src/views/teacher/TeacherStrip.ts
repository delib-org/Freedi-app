import m from 'mithril';
import { Icon } from '../../components/Icon';
import { t } from '../../lib/i18n';
import { teacherStepLabel } from '../../lib/teacherSteps';
import type { AgoraStagePlanItem } from '@freedi/shared-types';

/** The one button the teacher presses between steps */
export interface StripAction {
	label: string;
	onclick: () => void;
	disabled: boolean;
	/** The server has the request; the label stays, the arrow spins */
	busy: boolean;
}

export interface TeacherStripAttrs {
	/** The steps a teacher counts — the plan without its terminal marker */
	steps: readonly AgoraStagePlanItem[];
	/** Which of `steps` the room is on */
	currentIndex: number;
	/** null once the lesson has ended: the strip then offers the summary */
	action: StripAction | null;
	/** Where "to the summary" leads after the last press */
	reportRoute: string;
	/** The last advance was refused or never arrived — say so on the strip */
	failed: boolean;
	onRetry: () => void;
}

const STEPS_ID = 'teacher-steps';

/**
 * The console's control strip: where the room is, and the one way forward.
 *
 * It used to be a card of eight chips at the top and a button at the bottom
 * of a card about join codes — 1,200px apart, the button never in the first
 * viewport. Now they are one row, stuck under the header on a laptop and
 * fixed to the bottom of a phone, so the button the teacher presses eight
 * times a lesson is always where their thumb already is.
 *
 * The step text opens the full list as a popover — a map, not a menu:
 * nothing in it is tappable, because the strip's button is the only way a
 * stage opens.
 */
export function TeacherStrip(): m.Component<TeacherStripAttrs> {
	let open = false;

	function onDocumentClick(event: MouseEvent): void {
		if (!open) return;
		if ((event.target as Element | null)?.closest('.teacher-strip')) return;
		open = false;
		m.redraw();
	}

	function onKey(event: KeyboardEvent): void {
		if (event.key === 'Escape' && open) {
			open = false;
			m.redraw();
		}
	}

	function stepsPopover(steps: readonly AgoraStagePlanItem[], currentIndex: number): m.Children {
		return m(
			'.teacher-steps',
			{
				id: STEPS_ID,
				role: 'region',
				'aria-label': t('teacher.plan_title'),
				oncreate: ({ dom }: m.VnodeDOM) => {
					dom.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest' });
				},
			},
			m(
				'ol.teacher-plan__list.teacher-plan--column',
				steps.map((item, index) =>
					m(
						'li.teacher-plan__item',
						{
							key: item.itemId,
							class:
								index < currentIndex
									? 'teacher-plan__item--done'
									: index === currentIndex
										? 'teacher-plan__item--current'
										: undefined,
							'aria-current': index === currentIndex ? 'step' : undefined,
						},
						[
							m(
								'span.teacher-plan__mark',
								index < currentIndex ? m(Icon, { name: 'check', size: 12 }) : String(index + 1),
							),
							m('span.teacher-plan__label', teacherStepLabel(item)),
						],
					),
				),
			),
		);
	}

	return {
		oncreate() {
			document.addEventListener('click', onDocumentClick);
			document.addEventListener('keydown', onKey);
		},
		onremove() {
			document.removeEventListener('click', onDocumentClick);
			document.removeEventListener('keydown', onKey);
		},

		view({ attrs }) {
			const { steps, currentIndex, action, reportRoute, failed, onRetry } = attrs;
			const current = steps[currentIndex];
			const ended = action === null;

			return m('.teacher-strip', [
				ended || !current
					? m('span.teacher-strip__step.teacher-strip__step--static', [
							m('span.teacher-strip__name', t('teacher.lesson_over')),
						])
					: m(
							'button.teacher-strip__step',
							{
								type: 'button',
								'aria-expanded': String(open),
								'aria-controls': STEPS_ID,
								class: open ? 'teacher-strip__step--open' : undefined,
								onclick: () => {
									open = !open;
								},
							},
							[
								m('span.teacher-strip__disc', String(currentIndex + 1)),
								m(
									'span.teacher-strip__index',
									t('teacher.step_of', { i: currentIndex + 1, n: steps.length }),
								),
								m('span.teacher-strip__name', teacherStepLabel(current)),
								m('span.teacher-strip__chevron', m(Icon, { name: 'arrow', size: 16 })),
							],
						),

				ended
					? m(
							'button.btn.btn--secondary.btn--lg.teacher-strip__next',
							{ type: 'button', onclick: () => m.route.set(reportRoute) },
							t('teacher.to_report'),
						)
					: m(
							'button.btn.btn--primary.btn--lg.teacher-strip__next',
							{
								id: 'teacher-next',
								type: 'button',
								disabled: action.disabled || action.busy,
								'aria-busy': action.busy ? 'true' : undefined,
								onclick: () => {
									open = false;
									action.onclick();
								},
							},
							[
								m('span', action.label),
								action.busy
									? m('span.spinner.teacher-strip__spinner')
									: m('span.teacher-strip__arrow', m(Icon, { name: 'arrow', size: 20 })),
							],
						),

				failed
					? m('p.teacher-strip__fail', { role: 'alert' }, [
							m(Icon, { name: 'flag', size: 18 }),
							m('span', t('teacher.advance_failed')),
							m(
								'button.btn.btn--ghost.btn--sm',
								{ type: 'button', onclick: onRetry },
								t('teacher.retry'),
							),
						])
					: null,

				open && current && !ended ? stepsPopover(steps, currentIndex) : null,
			]);
		},
	};
}
