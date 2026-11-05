import m from 'mithril';
import '@/styles/student-c2.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { stepLabel } from '@/lib/lesson';
import { rosterCount } from '../c2/c2Helpers';
import { watchRoster } from '../c2/rosterWatch';
import type { RosterWatch } from '../c2/rosterWatch';
import type { StepAttrs } from '../steps/stepSlot';

/**
 * Step 0, "Waiting for the teacher" (UX §2.2): the calm waiting state with the
 * count of students who joined. No button while waiting. The name form is not here:
 * a student with no name gets it at every step (NameGate, put in front by
 * StudentStage), so arriving late no longer skips it.
 */

export interface WaitingState {
	roster?: RosterWatch;
}

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
	oninit(vnode) {
		const state = vnode.state as unknown as WaitingState;
		state.roster = watchRoster(vnode.attrs.main.statementId);
	},

	onremove(vnode) {
		(vnode.state as unknown as WaitingState).roster?.stop();
	},

	view(vnode) {
		const state = vnode.state as unknown as WaitingState;
		const count = state.roster ? rosterCount(state.roster.subs) : 0;

		return m(StudentFrame, { headerLine: stepLabel('waiting') }, [
			m('.waiting', [
				lockIcon(),
				m('p.waiting__title', t('step.waiting')),
				state.roster?.ready && count > 0
					? m('p.waiting__count', { role: 'status' }, t('opening.waiting_count', { n: count }))
					: null,
			]),
		]);
	},
};
