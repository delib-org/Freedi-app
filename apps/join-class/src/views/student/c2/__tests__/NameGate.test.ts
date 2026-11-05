import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';

const saveMyName = vi.fn(async (): Promise<void> => undefined);

vi.mock('../saveName', () => ({ saveMyName }));
vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/lib/classroom/classState', () => ({ classState: { mySubscription: null } }));
vi.mock('@/lib/store', () => ({ getCustomDisplayName: () => null }));
vi.mock('@/components/StudentFrame', () => ({ StudentFrame: { view: () => null } }));

const { nameForm } = await import('../NameGate');
type State = Parameters<typeof nameForm>[0];

function freshState(name: string): State {
	return { name, saving: false, failed: false };
}

/** Just the parts of a mithril vnode these tests read. */
interface Node<A> {
	attrs: A;
	children: Node<unknown>[];
}

type FormAttrs = { onsubmit: (e: Event) => void };
type ButtonAttrs = { disabled?: boolean; type: string };

/** The form's own vnode: the frame's one child. */
function formOf(state: State): Node<FormAttrs> {
	const frame = nameForm(state, 'main') as unknown as Node<unknown>;

	return frame.children[0] as Node<FormAttrs>;
}

function saveButtonOf(form: Node<FormAttrs>): Node<ButtonAttrs> {
	const row = form.children[0];

	return row.children[1] as Node<ButtonAttrs>;
}

describe('the name form Save button', () => {
	beforeEach(() => {
		saveMyName.mockClear();
		// no DOM here: a redraw has nothing to draw
		m.redraw = (() => undefined) as typeof m.redraw;
	});

	it('is a submit button, disabled while the name is empty or blank', () => {
		for (const name of ['', '   ']) {
			const button = saveButtonOf(formOf(freshState(name)));
			expect(button.attrs.type).toBe('submit');
			expect(button.attrs.disabled).toBe(true);
		}
	});

	it('is enabled once there is a name, and disabled while saving', () => {
		expect(saveButtonOf(formOf(freshState('Dana'))).attrs.disabled).toBe(false);
		const saving = freshState('Dana');
		saving.saving = true;
		expect(saveButtonOf(formOf(saving)).attrs.disabled).toBe(true);
	});

	it('submitting the form (Save or Enter) saves the name', async () => {
		const state = freshState('Dana');
		const preventDefault = vi.fn();
		formOf(state).attrs.onsubmit({ preventDefault } as unknown as Event);
		await vi.waitFor(() => expect(saveMyName).toHaveBeenCalledWith('main', 'Dana'));
		expect(preventDefault).toHaveBeenCalled();
	});

	it('does not save an empty name', () => {
		formOf(freshState('  ')).attrs.onsubmit({
			preventDefault: () => undefined,
		} as unknown as Event);
		expect(saveMyName).not.toHaveBeenCalled();
	});
});

describe('the name form wording', () => {
	it('asks plainly, and says so when the teacher asked for a new name', () => {
		const ask = nameForm(freshState(''), 'main') as unknown as { attrs: { instruction: string } };
		const again = nameForm(freshState(''), 'main', true) as unknown as {
			attrs: { instruction: string };
		};
		expect(ask.attrs.instruction).toBe('opening.name_prompt');
		expect(again.attrs.instruction).toBe('opening.name_prompt_rename');
	});
});
