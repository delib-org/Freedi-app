import m from 'mithril';
import '@/styles/student-c2.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { classState } from '@/lib/classroom/classState';
import { getCustomDisplayName } from '@/lib/store';
import { saveMyName } from './saveName';

/**
 * The name form. It is not a step: `StudentStage` puts it in front of ANY step
 * while the student has no name (lib/classroom/nameGate.ts), so nobody reaches the
 * lesson nameless, and again when the teacher asks for a new name. It says why the name is needed and who sees it.
 */

export interface NameFormState {
	name: string;
	saving: boolean;
	failed: boolean;
}

export async function submitName(state: NameFormState, mainId: string): Promise<void> {
	if (!state.name.trim() || state.saving) return;
	state.saving = true;
	state.failed = false;
	try {
		await saveMyName(mainId, state.name);
	} catch {
		state.failed = true;
	}
	state.saving = false;
	m.redraw();
}

/** `rename`: the teacher asked for a new name, so the screen says so. */
export function nameForm(state: NameFormState, mainId: string, rename = false): m.Children {
	return m(
		StudentFrame,
		{
			headerLine: '',
			instruction: t(rename ? 'opening.name_prompt_rename' : 'opening.name_prompt'),
		},
		m(
			'form.name-entry',
			{
				'data-testid': 'name-gate',
				onsubmit: (e: Event) => {
					e.preventDefault();
					void submitName(state, mainId);
				},
			},
			[
				m('.name-entry__row', [
					m('input.name-entry__input', {
						type: 'text',
						autocomplete: 'off',
						enterkeyhint: 'done',
						value: state.name,
						placeholder: t('opening.name_placeholder'),
						'aria-label': t('opening.name_prompt'),
						oninput: (e: Event) => {
							state.name = (e.target as HTMLInputElement).value;
						},
					}),
					m(
						'button.btn.btn--primary.name-entry__save',
						{
							type: 'submit',
							'data-testid': 'name-save',
							disabled: !state.name.trim() || state.saving,
						},
						state.saving ? t('opening.name_saving_short') : t('opening.name_save'),
					),
				]),
				m('p.name-entry__hint', t('opening.name_hint')),
				state.failed ? m('p.name-entry__error', { role: 'alert' }, t('opening.name_failed')) : null,
			],
		),
	);
}

export interface NameGateAttrs {
	mainId: string;
}

export const NameGate: m.Component<NameGateAttrs> = {
	oninit(vnode) {
		const state = vnode.state as unknown as NameFormState;
		// A rename starts empty: the teacher wants a different name than the one on file.
		state.name = classState.mySubscription?.renameRequested ? '' : (getCustomDisplayName() ?? '');
		state.saving = false;
		state.failed = false;
	},

	view(vnode) {
		return nameForm(
			vnode.state as unknown as NameFormState,
			vnode.attrs.mainId,
			classState.mySubscription?.renameRequested === true,
		);
	},
};
