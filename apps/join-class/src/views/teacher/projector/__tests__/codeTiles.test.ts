// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import m from 'mithril';
import { CODE_SPLIT_FROM, CodeTiles, codeGroups } from '../CodeTiles';

afterEach(() => {
	document.body.innerHTML = '';
});

function mount(code: string): HTMLElement {
	const root = document.createElement('div');
	document.body.appendChild(root);
	m.render(root, m(CodeTiles, { code }));

	return root.firstElementChild as HTMLElement;
}

describe('codeGroups', () => {
	it('reads a six-digit class code as two groups of three', () => {
		expect(codeGroups('482913')).toEqual([
			['4', '8', '2'],
			['9', '1', '3'],
		]);
	});

	it('gives the first group the odd character', () => {
		expect(codeGroups('12345')).toEqual([
			['1', '2', '3'],
			['4', '5'],
		]);
	});

	it('keeps a short code in one group', () => {
		const short = '1234';

		expect(short.length).toBeLessThan(CODE_SPLIT_FROM);
		expect(codeGroups(short)).toEqual([['1', '2', '3', '4']]);
	});

	it('drops spaces, so a spaced code reads the same', () => {
		expect(codeGroups(' 482 913 ')).toEqual(codeGroups('482913'));
	});

	it('gives nothing for an empty code', () => {
		expect(codeGroups('')).toEqual([]);
		expect(codeGroups('   ')).toEqual([]);
	});

	it('never loses or reorders a character', () => {
		for (const code of ['7', '90', '314', '2718', '16180', '482913', '1234567']) {
			expect(codeGroups(code).flat().join('')).toBe(code);
		}
	});
});

describe('CodeTiles', () => {
	it('draws one tile per digit, in two groups', () => {
		const box = mount('482913');
		const groups = box.querySelectorAll('.code-tiles__group');

		expect(groups).toHaveLength(2);
		expect(box.querySelectorAll('.code-tiles__digit')).toHaveLength(6);
		expect(groups[0].textContent).toBe('482');
		expect(groups[1].textContent).toBe('913');
	});

	it('is decoration: hidden unless a look shows it, never read out, left to right', () => {
		const box = mount('482913');

		expect(box.hidden).toBe(true);
		expect(box.getAttribute('aria-hidden')).toBe('true');
		expect(box.getAttribute('dir')).toBe('ltr');
	});

	it('shows nothing but the code', () => {
		expect(mount('482913').textContent).toBe('482913');
	});
});
