import m from 'mithril';
import type { WritingMode } from '@freedi/shared-types';
import { t } from '@/lib/i18n';

export type WriteState = 'idle' | 'sending' | 'sent' | 'failed' | 'refused';

export const WRITE_MAX_CHARS = 280;

export interface WriteBoxAttrs {
	/** Eyebrow above the box: "Our answer" / "Dana is writing for the table". */
	label: string;
	value: string;
	onInput: (text: string) => void;
	/** Mirrored (a tablemate writes) or locked: shown, not editable. */
	readOnly?: boolean;
	state: WriteState;
	placeholder?: string;
	rows?: number;
	testId?: string;
}

/** Waits for the on-screen keyboard to finish rising before the box is centred. */
const FOCUS_SCROLL_DELAY_MS = 300;

/** A textarea with its counter and, once sent, a teal "Sent" line. */
export const WriteBox: m.Component<WriteBoxAttrs> = {
	view({ attrs }) {
		const { value, readOnly, state } = attrs;

		return m('.write', [
			m('label.write__label', [
				m('span.write__eyebrow', attrs.label),
				m('textarea.write__area', {
					dir: 'auto',
					'data-testid': attrs.testId,
					rows: attrs.rows ?? 3,
					maxlength: WRITE_MAX_CHARS,
					value,
					readOnly: readOnly ? true : undefined,
					placeholder: attrs.placeholder,
					oninput: (event: Event) => attrs.onInput((event.target as HTMLTextAreaElement).value),
					// The phone keyboard rises over the bottom; bring the box back above the pinned send bar.
					onfocus: (event: FocusEvent) => {
						const area = event.target as HTMLTextAreaElement;
						setTimeout(
							() => area.scrollIntoView({ block: 'center', behavior: 'auto' }),
							FOCUS_SCROLL_DELAY_MS,
						);
					},
				}),
			]),
			readOnly
				? null
				: m(
						'p.write__count',
						{ 'aria-hidden': 'true' },
						t('answer.counter', { n: value.length, max: WRITE_MAX_CHARS }),
					),
			state === 'sent' ? m('p.write__sent', t('answer.sent')) : null,
			// The language check refused the words (IA 24.3): the text stays, the student rewrites it.
			state === 'refused' ? m('p.write__refused', { role: 'alert' }, t('proposal.refused')) : null,
		]);
	},
};

export interface ModeSwitchAttrs {
	mode: WritingMode;
	/** Only the asker; locked after the table's first send. */
	disabled: boolean;
	onChange: (mode: WritingMode) => void;
}

const MODES: readonly WritingMode[] = ['each', 'table'];

/** "Everyone writes | One answer for the table" (a two-option segment). */
export const ModeSwitch: m.Component<ModeSwitchAttrs> = {
	view({ attrs }) {
		return m(
			'.mode',
			{ role: 'radiogroup', 'aria-label': t('answer.mode_label') },
			MODES.map((mode) =>
				m(
					'button.mode__option',
					{
						key: mode,
						type: 'button',
						role: 'radio',
						'aria-checked': attrs.mode === mode ? 'true' : 'false',
						disabled: attrs.disabled ? true : undefined,
						class: attrs.mode === mode ? 'mode__option--on' : '',
						onclick: () => attrs.onChange(mode),
					},
					t(`answer.mode_${mode}`),
				),
			),
		);
	},
};
