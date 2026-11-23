import { describe, expect, it } from 'vitest';
import m from 'mithril';
import he from '@/lib/locales/he';
import { sectionHead } from '../planSectionHead';

/** Trello DMMTEOlR: every plan section has a title and a short purpose note. */
describe('sectionHead', () => {
	it('renders the title as the labelled heading and the purpose under it', () => {
		const [title, purpose] = sectionHead('plan-x-title', 'Title', 'What it is for') as m.Vnode[];

		expect(title.tag).toBe('h2');
		expect((title.attrs as { id: string }).id).toBe('plan-x-title');
		expect(purpose.tag).toBe('p');
		expect((purpose.attrs as { className: string }).className).toBe('plan__help');
	});
});

describe('plan section purpose notes', () => {
	const KEYS = [
		'plan.help',
		'plan.details.help',
		'plan.sides.help',
		'plan.challenge.help',
		'plan.intro.help',
		'plan.tables.help',
	];

	it.each(KEYS)('%s is written in Hebrew', (key) => {
		const text = (he as Record<string, string>)[key];

		expect(text).toMatch(/[֐-׿]/);
	});
});
