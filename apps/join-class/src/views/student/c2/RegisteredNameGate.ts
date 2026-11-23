import m from 'mithril';
import '@/styles/student-c2.scss';
import '@/styles/night/c2.scss';
import type { ClassNameAnswer, ClassNameChoice } from '@freedi/shared-types';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { classState } from '@/lib/classroom/classState';
import { getCustomDisplayName } from '@/lib/store';
import {
	backToAsk,
	choiceLabelKey,
	initialGateState,
	stepOfResponse,
} from '@/lib/classroom/arrival';
import type { GateState } from '@/lib/classroom/arrival';
import { arriveByName } from '@/lib/classroom/arrivalActions';

/**
 * The name gate of a connected lesson (IA tables-class-bridge 5.2, 7). It is not a
 * step: `StudentStage` puts it in front of the steps while the student has not
 * arrived. One field, "write your full name, as you registered", and the four
 * answers the server can give besides "you are in":
 *   nameTaken  -> "is it you, on another device?"  (yes / someone else)
 *   nameTwice  -> pick your table (by number and topic, nothing else)
 *   notFound   -> fix the name, or join without registering
 * Nobody becomes a walk-in silently.
 */

export interface RegisteredNameGateAttrs {
	mainId: string;
}

interface GateInstance {
	gate: GateState;
}

async function submit(
	state: GateInstance,
	mainId: string,
	answer?: ClassNameAnswer,
): Promise<void> {
	const gate = state.gate;
	if (!gate.name.trim() || gate.saving) return;
	gate.saving = true;
	gate.failed = false;
	m.redraw();
	try {
		gate.step = stepOfResponse(await arriveByName(mainId, gate.name, answer));
	} catch {
		gate.failed = true;
	}
	gate.saving = false;
	m.redraw();
}

function button(
	label: string,
	onclick: () => void,
	kind: 'primary' | 'secondary',
	busy: boolean,
): m.Vnode {
	return m(
		`button.btn.btn--${kind}.name-gate__action`,
		{ type: 'button', disabled: busy, onclick },
		label,
	);
}

function choiceLabel(choice: ClassNameChoice): string {
	return t(choiceLabelKey(choice), { n: choice.tableN, topic: choice.topic ?? '' });
}

function failedLine(gate: GateState): m.Children {
	return gate.failed ? m('p.name-entry__error', { role: 'alert' }, t('opening.name_failed')) : null;
}

function askForm(state: GateInstance, mainId: string): m.Vnode {
	const gate = state.gate;

	return m(
		'form.name-entry',
		{
			'data-testid': 'registered-name-gate',
			onsubmit: (e: Event) => {
				e.preventDefault();
				void submit(state, mainId);
			},
		},
		[
			m('.name-entry__row', [
				m('input.name-entry__input', {
					type: 'text',
					autocomplete: 'name',
					enterkeyhint: 'done',
					value: gate.name,
					placeholder: t('opening.name_placeholder'),
					'aria-label': t('opening.name_prompt.registered'),
					oninput: (e: Event) => {
						gate.name = (e.target as HTMLInputElement).value;
					},
				}),
				m(
					'button.btn.btn--primary.name-entry__save',
					{
						type: 'submit',
						'data-testid': 'name-save',
						disabled: !gate.name.trim() || gate.saving,
					},
					gate.saving ? t('opening.name_saving_short') : t('opening.name_join'),
				),
			]),
			m('p.name-entry__hint', t('opening.name_hint')),
			failedLine(gate),
		],
	);
}

function questionBlock(
	text: string,
	testId: string,
	actions: m.Children,
	gate: GateState,
): m.Vnode {
	return m('section.name-gate', { 'data-testid': testId }, [
		m('p.name-gate__question', { role: 'status', dir: 'auto' }, text),
		m('div.name-gate__actions', actions),
		failedLine(gate),
	]);
}

function body(state: GateInstance, mainId: string): m.Children {
	const gate = state.gate;
	const step = gate.step;
	const busy = gate.saving;
	if (step.kind === 'taken') {
		return questionBlock(
			t('opening.name_taken'),
			'name-taken',
			[
				button(
					t('opening.name_taken.yes'),
					() => void submit(state, mainId, { kind: 'itsMe' }),
					'primary',
					busy,
				),
				button(
					t('opening.name_taken.no'),
					() => void submit(state, mainId, { kind: 'someoneElse' }),
					'secondary',
					busy,
				),
			],
			gate,
		);
	}
	if (step.kind === 'twice') {
		return questionBlock(
			t('opening.name_twice'),
			'name-twice',
			step.choices.map((choice) =>
				m(
					'button.btn.btn--secondary.name-gate__action',
					{
						key: choice.seatId,
						type: 'button',
						'data-testid': 'name-twice-choice',
						disabled: busy,
						onclick: () => void submit(state, mainId, { kind: 'pick', seatId: choice.seatId }),
					},
					choiceLabel(choice),
				),
			),
			gate,
		);
	}
	if (step.kind === 'notFound') {
		return questionBlock(
			t('opening.name_not_found'),
			'name-not-found',
			[
				button(
					t('opening.name_not_found.fix'),
					() => {
						state.gate = backToAsk(gate);
					},
					'primary',
					busy,
				),
				button(
					t('opening.name_not_found.join_new'),
					() => void submit(state, mainId, { kind: 'joinWithout' }),
					'secondary',
					busy,
				),
			],
			gate,
		);
	}
	if (step.kind === 'done') {
		return m('p.name-entry__hint', { role: 'status' }, t('opening.name_saving_short'));
	}

	return askForm(state, mainId);
}

export const RegisteredNameGate: m.Component<RegisteredNameGateAttrs> = {
	oninit(vnode) {
		const state = vnode.state as unknown as GateInstance;
		// A returning student sees the name they last used; the field is theirs to change.
		const known = classState.mySubscription?.user?.displayName?.trim() || getCustomDisplayName();
		state.gate = initialGateState(known ?? '');
	},

	view(vnode) {
		const state = vnode.state as unknown as GateInstance;

		return m(
			StudentFrame,
			{ headerLine: '', instruction: t('opening.name_prompt.registered') },
			body(state, vnode.attrs.mainId),
		);
	},
};
