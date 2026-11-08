import { describe, expect, it } from 'vitest';
import { continueList, isBoldShortcut, toggleBold, toggleList } from '../introEditing';

const keys = (
	over: Partial<Parameters<typeof isBoldShortcut>[0]>,
): Parameters<typeof isBoldShortcut>[0] => ({
	code: 'KeyB',
	ctrlKey: true,
	metaKey: false,
	altKey: false,
	shiftKey: false,
	...over,
});

describe('isBoldShortcut', () => {
	it('matches the physical B key, so it works on a Hebrew keyboard (where key is "נ")', () => {
		expect(isBoldShortcut({ ...keys({}), key: 'נ' } as never)).toBe(true);
		expect(isBoldShortcut(keys({ ctrlKey: false, metaKey: true }))).toBe(true);
	});

	it('ignores other keys, a bare B, and Alt/Shift chords', () => {
		expect(isBoldShortcut(keys({ code: 'KeyI' }))).toBe(false);
		expect(isBoldShortcut(keys({ ctrlKey: false }))).toBe(false);
		expect(isBoldShortcut(keys({ altKey: true }))).toBe(false);
		expect(isBoldShortcut(keys({ shiftKey: true }))).toBe(false);
	});
});

describe('toggleBold', () => {
	it('wraps a Hebrew selection and keeps it selected', () => {
		const value = 'שלום עולם';
		const out = toggleBold(value, 0, 4);
		expect(out.value).toBe('**שלום** עולם');
		expect(out.value.slice(out.start, out.end)).toBe('שלום');
	});

	it('unwraps when the stars are just outside the selection, or inside it', () => {
		expect(toggleBold('**שלום** עולם', 2, 6).value).toBe('שלום עולם');
		const inside = toggleBold('**שלום** עולם', 0, 8);
		expect(inside.value).toBe('שלום עולם');
		expect(inside.value.slice(inside.start, inside.end)).toBe('שלום');
	});

	it('inserts **** with the caret in the middle when nothing is selected', () => {
		const out = toggleBold('אב', 1, 1);
		expect(out.value).toBe('א****ב');
		expect([out.start, out.end]).toEqual([3, 3]);
	});
});

describe('toggleList', () => {
	it('bullets every non-empty line the selection touches', () => {
		const out = toggleList('a\n\nb\nc', 0, 4, 'ul');
		expect(out.value).toBe('- a\n\n- b\nc');
	});

	it('numbers lines 1, 2, 3 and removes the markers when all lines already have them', () => {
		const numbered = toggleList('a\nb\nc', 0, 5, 'ol');
		expect(numbered.value).toBe('1. a\n2. b\n3. c');
		expect(toggleList(numbered.value, 0, numbered.value.length, 'ol').value).toBe('a\nb\nc');
	});

	it('switches a bullet list to a numbered one', () => {
		expect(toggleList('- a\n- b', 0, 7, 'ol').value).toBe('1. a\n2. b');
	});

	it('works on the line of a bare caret and ignores the line after a trailing newline', () => {
		expect(toggleList('שלום\nעולם', 2, 2, 'ul').value).toBe('- שלום\nעולם');
		expect(toggleList('a\nb', 0, 2, 'ul').value).toBe('- a\nb');
	});
});

describe('continueList', () => {
	it('continues a bullet', () => {
		const out = continueList('- אחד', 5);
		expect(out?.value).toBe('- אחד\n- ');
		expect(out?.start).toBe(out?.value.length);
	});

	it('continues a numbered item with the next number, keeping . or )', () => {
		expect(continueList('1. a\n2. b', 9)?.value).toBe('1. a\n2. b\n3. ');
		expect(continueList('4) x', 4)?.value).toBe('4) x\n5) ');
	});

	it('ends the list on a line that is only its marker', () => {
		const out = continueList('- a\n- ', 6);
		expect(out?.value).toBe('- a\n');
		expect(out?.start).toBe(4);
	});

	it('returns null on a plain line (the textarea inserts its newline)', () => {
		expect(continueList('שלום', 4)).toBeNull();
	});

	it('splits a list line when Enter is pressed mid-text', () => {
		expect(continueList('- ab', 4 - 1)?.value).toBe('- a\n- b');
	});
});
