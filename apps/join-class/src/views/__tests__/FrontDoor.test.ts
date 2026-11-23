// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key, isRTL: () => true }));
vi.mock('@/styles/front-door.scss', () => ({}));

import { FrontDoor } from '../FrontDoor';
import { mountSmoke, type Mounted } from './mountSmoke';

let mounted: Mounted | null = null;
let params: Record<string, string> = {};
const routeSet = vi.fn();

function open(query: Record<string, string> = {}): HTMLElement {
	params = query;
	mounted = mountSmoke(() => m(FrontDoor));

	return mounted.root;
}

function codeBox(root: HTMLElement): HTMLInputElement {
	const input = root.querySelector<HTMLInputElement>('#door-code');
	if (!input) throw new Error('the code box is not on the page');

	return input;
}

function type(root: HTMLElement, text: string): void {
	const input = codeBox(root);
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	m.redraw.sync();
}

function submit(root: HTMLElement): void {
	root
		.querySelector('form')
		?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
	m.redraw.sync();
}

describe('FrontDoor', () => {
	beforeEach(() => {
		m.route.prefix = '';
		routeSet.mockReset();
		vi.spyOn(m.route, 'set').mockImplementation(routeSet);
		vi.spyOn(m.route, 'param').mockImplementation(((name: string) => params[name]) as never);
	});

	afterEach(() => {
		mounted?.unmount();
		mounted = null;
		vi.restoreAllMocks();
	});

	it('says what Class is for: one logo, one headline, one line, three steps', () => {
		const root = open();

		expect(root.querySelectorAll('img[alt="WizCol"]')).toHaveLength(1);
		expect(root.querySelectorAll('h1')).toHaveLength(1);
		expect(root.querySelector('h1')?.textContent).toBe('front.title');
		expect(root.querySelector('.front-door__lead')?.textContent).toBe('front.lead');
		const steps = Array.from(root.querySelectorAll('ol.front-door__steps > li'));
		expect(steps.map((step) => step.firstElementChild?.textContent)).toEqual([
			'front.how.1.title',
			'front.how.2.title',
			'front.how.3.title',
		]);
	});

	it('leads with "Start a lesson" to the teacher entry, and keeps the code box after it', () => {
		const root = open();
		const start = root.querySelector<HTMLAnchorElement>('a.front-door__start');
		const form = root.querySelector('form.front-door__join');

		expect(start?.textContent).toBe('front.start');
		expect(start?.getAttribute('href')).toBe('/t');
		expect(start?.classList.contains('btn--primary')).toBe(true);
		expect(form).not.toBeNull();
		expect(
			start && form && start.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(root.querySelector('label[for="door-code"]')?.textContent).toBe('front.join.label');
		expect(form?.querySelector('button[type="submit"]')?.textContent).toBe('door.code.enter');
	});

	it('does not take focus on a plain arrival (no keyboard over the headline)', () => {
		const root = open();

		expect(document.activeElement).not.toBe(codeBox(root));
	});

	it('keeps only digits and enters by itself on the sixth', () => {
		const root = open();

		type(root, '48a2 9');
		expect(codeBox(root).value).toBe('4829');
		expect(routeSet).not.toHaveBeenCalled();

		type(root, '482 913');
		expect(routeSet).toHaveBeenCalledWith('/c/482913');
	});

	it('never keeps more than six digits', () => {
		const root = open();

		type(root, '4829137');

		expect(codeBox(root).value).toBe('482913');
		expect(routeSet).toHaveBeenCalledWith('/c/482913');
	});

	it('Enter with fewer than six digits stays and marks the field', () => {
		const root = open();

		type(root, '123');
		submit(root);

		expect(routeSet).not.toHaveBeenCalled();
		expect(codeBox(root).getAttribute('aria-invalid')).toBe('true');
		expect(document.activeElement).toBe(codeBox(root));
	});

	it('shows a code that came back unknown, selected, and does not send it again', () => {
		const root = open({ code: '482913', error: 'unknown' });
		const input = codeBox(root);

		expect(input.value).toBe('482913');
		expect(document.activeElement).toBe(input);
		expect(input.getAttribute('aria-describedby')).toBe('door-error');
		expect(root.querySelector('#door-error[role="alert"]')?.textContent).toContain(
			'lesson.code.unknown.title',
		);
		expect(routeSet).not.toHaveBeenCalled();

		type(root, '482913');
		expect(routeSet).not.toHaveBeenCalled();

		type(root, '482914');
		expect(routeSet).toHaveBeenCalledWith('/c/482914');
	});

	it('says so when the lesson could not be reached offline', () => {
		const root = open({ code: '482913', error: 'offline' });

		expect(root.querySelector('.door__error-title')?.textContent).toBe('lesson.code.offline');
		expect(root.querySelector('.door__error-body')).toBeNull();
	});
});
