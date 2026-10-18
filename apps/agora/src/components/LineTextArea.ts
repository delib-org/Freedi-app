import m from 'mithril';

export interface LineTextAreaAttrs {
	/** The text the stored data formats to */
	value: string;
	rows: number;
	/** Every keystroke, with the raw text: parse it, store what it means */
	onText: (text: string) => void;
}

/**
 * A text box whose text is a list, one entry a line (arguments, needs, values,
 * dialogue). The stored list drops blank lines, so a box that always showed the
 * stored list would swallow the new line Enter has just made and the teacher
 * could not start a second entry. While the box is in use it shows exactly what
 * was typed; once it is left, it shows the tidy stored form again.
 */
export function LineTextArea(): m.Component<LineTextAreaAttrs> {
	let draft: string | null = null;

	return {
		view({ attrs }) {
			return m('textarea.text-input', {
				value: draft ?? attrs.value,
				rows: attrs.rows,
				oninput: (event: InputEvent) => {
					draft = (event.target as HTMLTextAreaElement).value;
					attrs.onText(draft);
				},
				onblur: () => {
					draft = null;
				},
			});
		},
	};
}
