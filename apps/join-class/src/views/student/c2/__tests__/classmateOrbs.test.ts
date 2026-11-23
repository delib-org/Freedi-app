// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import m from 'mithril';
import {
	ClassmateOrbs,
	MAX_CLASSMATE_ORBS,
	ORB_COLORS,
	classmateOrbColors,
} from '../classmateOrbs';

afterEach(() => {
	document.body.innerHTML = '';
});

function mount(count: number): HTMLElement {
	const root = document.createElement('div');
	document.body.appendChild(root);
	m.render(root, m(ClassmateOrbs, { count }));

	return root.firstElementChild as HTMLElement;
}

describe('classmateOrbColors', () => {
	it('gives one colour per student who joined', () => {
		expect(classmateOrbColors(0)).toEqual([]);
		expect(classmateOrbColors(3)).toEqual(['magenta', 'cyan', 'orange']);
	});

	it('cycles through the colours in order', () => {
		const colors = classmateOrbColors(ORB_COLORS.length + 2);

		expect(colors.slice(0, ORB_COLORS.length)).toEqual([...ORB_COLORS]);
		expect(colors.slice(ORB_COLORS.length)).toEqual([ORB_COLORS[0], ORB_COLORS[1]]);
	});

	it('never shows more than the cap', () => {
		expect(classmateOrbColors(MAX_CLASSMATE_ORBS)).toHaveLength(MAX_CLASSMATE_ORBS);
		expect(classmateOrbColors(MAX_CLASSMATE_ORBS + 15)).toHaveLength(MAX_CLASSMATE_ORBS);
	});

	it('shows nothing for a count that is not a usable number', () => {
		expect(classmateOrbColors(-4)).toEqual([]);
		expect(classmateOrbColors(Number.NaN)).toEqual([]);
		expect(classmateOrbColors(Number.POSITIVE_INFINITY)).toEqual([]);
		expect(classmateOrbColors(2.9)).toHaveLength(2);
	});
});

describe('ClassmateOrbs', () => {
	it('draws one orb per student and one open slot', () => {
		const box = mount(4);

		expect(box.querySelectorAll('.classmates__orb')).toHaveLength(4);
		expect(box.querySelectorAll('.classmates__slot')).toHaveLength(1);
		expect(box.querySelector('.classmates__orb')?.className).toContain('classmates__orb--magenta');
	});

	it('is decoration: hidden unless a look shows it, never read out, no text', () => {
		const box = mount(25);

		expect(box.hidden).toBe(true);
		expect(box.getAttribute('aria-hidden')).toBe('true');
		expect(box.textContent).toBe('');
		expect(box.querySelectorAll('.classmates__orb')).toHaveLength(MAX_CLASSMATE_ORBS);
	});
});
