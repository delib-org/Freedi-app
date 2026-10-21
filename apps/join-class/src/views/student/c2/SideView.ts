import m from 'mithril';
import '@/styles/student-c2.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { SideSlider } from '@/components/SideSlider';
import { classState } from '@/lib/classroom/classState';
import { setMySide } from '@/lib/classroom/studentWrites';
import { sideNamesOf } from '@/lib/classroom/classSettings';
import { t } from '@/lib/i18n';
import { stepLabel } from '@/lib/lesson';
import { SIDE_CENTER } from '../c2/c2Helpers';
import type { StepAttrs } from '../steps/stepSlot';

/**
 * Step 2, Side (UX §2.4): "Which side are you closer to?" on the side slider.
 * The first touch of the thumb enables "Confirm"; moving the thumb saves after
 * a short pause (or at once on Confirm). The slider stays live until the
 * teacher opens Tables, so a second pick is allowed.
 */

/** Pause after the last thumb movement before the side is written. */
const SIDE_SAVE_DEBOUNCE_MS = 300;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

interface SideState {
	value: number;
	touched: boolean;
	status: SaveStatus;
	timer?: ReturnType<typeof setTimeout>;
	/** Latest write wins when several are in flight. */
	writeSeq: number;
	/** A thumb move waits for its debounced write. */
	pending: boolean;
}

async function save(state: SideState, mainId: string): Promise<void> {
	clearTimeout(state.timer);
	state.pending = false;
	const seq = ++state.writeSeq;
	state.status = 'saving';
	m.redraw();
	try {
		await setMySide(mainId, state.value);
		if (seq === state.writeSeq) state.status = 'saved';
	} catch (error) {
		console.error('[SideStep] save failed:', error);
		if (seq === state.writeSeq) state.status = 'failed';
	}
	m.redraw();
}

function actionButton(state: SideState, mainId: string): m.Vnode {
	if (state.status === 'saved') {
		return m(
			'button.btn.btn--agree',
			{ type: 'button', disabled: true, 'data-testid': 'side-confirm' },
			t('side.saved'),
		);
	}
	if (state.status === 'saving') {
		return m(
			'button.btn.btn--primary',
			{ type: 'button', disabled: true, 'data-testid': 'side-confirm' },
			t('side.saving'),
		);
	}

	return m(
		'button.btn.btn--primary',
		{
			type: 'button',
			disabled: !state.touched,
			'data-testid': 'side-confirm',
			onclick: () => void save(state, mainId),
		},
		t('side.confirm'),
	);
}

export const SideView: m.Component<StepAttrs> = {
	oninit(vnode) {
		const state = vnode.state as unknown as SideState;
		const saved = classState.mySubscription?.side;
		state.touched = typeof saved === 'number';
		state.value = state.touched ? (saved as number) : SIDE_CENTER;
		state.status = state.touched ? 'saved' : 'idle';
		state.writeSeq = 0;
		state.pending = false;
	},

	onremove(vnode) {
		const state = vnode.state as unknown as SideState;
		clearTimeout(state.timer);
		// the teacher may advance within the debounce: do not lose the last move
		if (state.pending) {
			state.pending = false;
			setMySide(vnode.attrs.main.statementId, state.value).catch((error: unknown) => {
				console.error('[SideStep] flush on leave failed:', error);
			});
		}
	},

	view(vnode) {
		const state = vnode.state as unknown as SideState;
		const mainId = vnode.attrs.main.statementId;
		const names = sideNamesOf(vnode.attrs.main);
		// a refreshed phone: the saved side arrives after the first render
		const saved = classState.mySubscription?.side;
		if (!state.touched && typeof saved === 'number') {
			state.touched = true;
			state.value = saved;
			state.status = 'saved';
		}

		return m(
			StudentFrame,
			{
				headerLine: stepLabel('side'),
				instruction: t('side.title'),
				action: [
					state.status === 'failed'
						? m('p.side-step__error', { role: 'alert' }, t('side.failed'))
						: null,
					actionButton(state, mainId),
				],
			},
			m(SideSlider, {
				value: state.value,
				nameA: names.a,
				nameB: names.b,
				onInput: (value: number) => {
					state.value = value;
					state.touched = true;
					state.status = 'idle';
					state.pending = true;
					clearTimeout(state.timer);
					state.timer = setTimeout(() => void save(state, mainId), SIDE_SAVE_DEBOUNCE_MS);
				},
			}),
		);
	},
};
