import m from 'mithril';
import { describe, expect, it, vi } from 'vitest';
import { RoundAnswer, type RoundAnswerAttrs } from '../RoundAnswer';
import { t } from '../../lib/i18n';

vi.mock('../StalledBanner', () => ({ stalledBanner: () => null }));

interface Node {
	tag?: unknown;
	attrs?: Record<string, unknown>;
	children?: unknown;
	text?: unknown;
}

function nodes(tree: unknown): Node[] {
	if (Array.isArray(tree)) return tree.flatMap(nodes);
	if (!tree || typeof tree !== 'object') return [];
	const node = tree as Node;

	return [node, ...nodes(node.children)];
}

function nodeText(tree: unknown): string {
	if (typeof tree === 'string') return tree;
	if (Array.isArray(tree)) return tree.map(nodeText).join('');
	if (!tree || typeof tree !== 'object') return '';
	const node = tree as Node;

	return nodeText(node.text) + nodeText(node.children);
}

function render(overrides: Partial<RoundAnswerAttrs> = {}): Node[] {
	const attrs: RoundAnswerAttrs = {
		kind: 'story',
		text: '',
		editing: false,
		saving: false,
		saveFailed: false,
		changed: false,
		onEdit: vi.fn(),
		onCancel: vi.fn(),
		onInput: vi.fn(),
		onSave: vi.fn(),
		...overrides,
	};

	return nodes(RoundAnswer.view({ attrs } as m.Vnode<RoundAnswerAttrs>));
}

describe('round answer reading and editing', () => {
	it('opens an empty editor with Send disabled before the first answer', () => {
		const tree = render();
		expect(tree.find((node) => node.tag === 'textarea')?.attrs?.value).toBe('');
		expect(tree.find((node) => node.tag === 'button')?.attrs?.disabled).toBe(true);
	});

	it('shows confirmed words and an explicit edit action instead of a disabled form', () => {
		const onEdit = vi.fn();
		const tree = render({ savedText: 'My story', text: 'My story', onEdit });
		expect(tree.some((node) => nodeText(node) === 'My story')).toBe(true);
		expect(tree.some((node) => node.tag === 'textarea')).toBe(false);
		expect(tree.some((node) => node.attrs?.role === 'status')).toBe(true);
		const edit = tree.find((node) => node.tag === 'button');
		expect(nodeText(edit)).toBe(t('delib.edit_text'));
		(edit?.attrs?.onclick as () => void)();
		expect(onEdit).toHaveBeenCalledOnce();
	});

	it('offers cancel while editing and prevents resubmitting unchanged text', () => {
		const onCancel = vi.fn();
		const tree = render({ savedText: 'My story', text: 'My story', editing: true, onCancel });
		expect(tree.find((node) => node.tag === 'textarea')?.attrs?.value).toBe('My story');
		const buttons = tree.filter((node) => node.tag === 'button');
		expect(buttons[0]?.attrs?.disabled).toBe(true);
		(buttons[1]?.attrs?.onclick as () => void)();
		expect(onCancel).toHaveBeenCalledOnce();
	});

	it('keeps the draft visible and controls locked until saving is confirmed', () => {
		const tree = render({ text: 'New words', savedText: 'New words', saving: true, changed: true });
		expect(tree.find((node) => node.tag === 'textarea')?.attrs?.disabled).toBe(true);
		expect(tree.filter((node) => node.tag === 'button').every((node) => node.attrs?.disabled)).toBe(
			true,
		);
		expect(tree.some((node) => node.attrs?.role === 'status')).toBe(false);
	});

	it('keeps failed text editable and allows retry even after an optimistic snapshot', () => {
		const onSave = vi.fn();
		const tree = render({
			text: 'New words',
			savedText: 'New words',
			saveFailed: true,
			changed: false,
			onSave,
		});
		expect(tree.find((node) => node.tag === 'textarea')?.attrs?.value).toBe('New words');
		expect(tree.some((node) => node.attrs?.role === 'alert')).toBe(true);
		const save = tree.find((node) => node.tag === 'button');
		expect(save?.attrs?.disabled).toBe(false);
		(save?.attrs?.onclick as () => void)();
		expect(onSave).toHaveBeenCalledOnce();
	});
});
