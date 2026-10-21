import m from 'mithril';
import '@/styles/student-c2.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { stepLabel } from '@/lib/lesson';
import { getCustomDisplayName, needsDisplayName } from '@/lib/store';
import { rosterCount } from '../c2/c2Helpers';
import { saveMyName } from '../c2/saveName';
import { watchRoster } from '../c2/rosterWatch';
import type { RosterWatch } from '../c2/rosterWatch';
import type { StepAttrs } from '../steps/stepSlot';

/**
 * Step 0, "Waiting for the teacher" (UX §2.2). A student who arrived by code
 * and has no name yet is asked for it once (kept on the device, shown to the
 * teacher only); then the screen is the calm waiting state with the count of
 * students who joined. No button while waiting.
 */

interface WaitingState {
	roster?: RosterWatch;
	name: string;
	asked: boolean;
	saving: boolean;
	failed: boolean;
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

async function submitName(state: WaitingState, mainId: string): Promise<void> {
	if (!state.name.trim() || state.saving) return;
	state.saving = true;
	state.failed = false;
	try {
		await saveMyName(mainId, state.name);
		state.asked = false;
	} catch {
		state.failed = true;
	}
	state.saving = false;
	m.redraw();
}

function nameForm(state: WaitingState, mainId: string): m.Children {
	return m(
		StudentFrame,
		{
			headerLine: stepLabel('waiting'),
			instruction: t('opening.name_prompt'),
			action: m(
				'button.btn.btn--primary',
				{
					type: 'button',
					disabled: !state.name.trim() || state.saving,
					onclick: () => void submitName(state, mainId),
				},
				state.saving ? t('opening.name_saving') : t('opening.name_join'),
			),
		},
		m(
			'form.name-entry',
			{
				onsubmit: (e: Event) => {
					e.preventDefault();
					void submitName(state, mainId);
				},
			},
			[
				m('input.name-entry__input', {
					type: 'text',
					autocomplete: 'off',
					value: state.name,
					placeholder: t('chat.name_placeholder'),
					'aria-label': t('opening.name_prompt'),
					oninput: (e: Event) => {
						state.name = (e.target as HTMLInputElement).value;
					},
				}),
				m('p.name-entry__hint', t('opening.name_hint')),
				state.failed ? m('p.name-entry__error', { role: 'alert' }, t('opening.name_failed')) : null,
			],
		),
	);
}

export const WaitingView: m.Component<StepAttrs> = {
	oninit(vnode) {
		const state = vnode.state as unknown as WaitingState;
		state.name = getCustomDisplayName() ?? '';
		state.asked = needsDisplayName();
		state.saving = false;
		state.failed = false;
		state.roster = watchRoster(vnode.attrs.main.statementId);
	},

	onremove(vnode) {
		(vnode.state as unknown as WaitingState).roster?.stop();
	},

	view(vnode) {
		const state = vnode.state as unknown as WaitingState;
		const mainId = vnode.attrs.main.statementId;
		if (state.asked) return nameForm(state, mainId);
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
