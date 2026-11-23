import m from 'mithril';
import { studentCountOf } from '@freedi/shared-types';
import '@/styles/student-c2.scss';
import '@/styles/night/c2.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { stepLabel } from '@/lib/lesson';
import { ClassmateOrbs } from './classmateOrbs';
import type { StepAttrs } from '../steps/stepSlot';

/**
 * Step 0, "Waiting for the teacher" (UX §2.2): the calm waiting state with the
 * count of students who joined (the server's count on the lesson: a phone may
 * not read the class's subscriptions, Trello sN881XCU). No button while waiting. The name form is not here:
 * a student with no name gets it at every step (NameGate, put in front by
 * StudentStage), so arriving late no longer skips it.
 */

function lockIcon(): m.Vnode {
	return m(
		'svg.waiting__icon',
		{ viewBox: '0 0 24 24', width: 48, height: 48, 'aria-hidden': 'true', focusable: 'false' },
		[
			m('rect', {
				x: 5,
				y: 11,
				width: 14,
				height: 9,
				rx: 2,
				fill: 'none',
				stroke: 'currentColor',
				'stroke-width': 2,
			}),
			m('path', {
				d: 'M8 11V8a4 4 0 0 1 8 0v3',
				fill: 'none',
				stroke: 'currentColor',
				'stroke-width': 2,
			}),
		],
	);
}

export const WaitingView: m.Component<StepAttrs> = {
	view(vnode) {
		const count = studentCountOf(vnode.attrs.main) ?? 0;

		return m(StudentFrame, { headerLine: stepLabel('waiting') }, [
			m('.waiting', [
				lockIcon(),
				m('p.waiting__title', t('step.waiting')),
				count > 0
					? m('p.waiting__count', { role: 'status' }, t('opening.waiting_count', { n: count }))
					: null,
				// Decoration of the night look only (hidden everywhere else).
				count > 0 ? m(ClassmateOrbs, { count }) : null,
			]),
		]);
	},
};
