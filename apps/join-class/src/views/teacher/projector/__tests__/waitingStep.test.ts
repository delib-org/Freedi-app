// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Statement } from '@freedi/shared-types';

vi.mock('@/lib/i18n', () => ({
	t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${String(vars.n)}` : key),
}));
// Dev's per-table question section reads texts through firebase; this step never does.
vi.mock('@/lib/classroom/questionText', () => ({
	getFetchedQuestionTexts: () => new Map<string, string>(),
	requestQuestionText: vi.fn(),
}));
vi.mock('@/lib/classroom/api', () => ({
	classRegistrationSupport: vi.fn(),
	classSupportBySide: vi.fn(() => new Promise(() => undefined)),
}));

interface FakeClass {
	roster: Array<{ userId: string }>;
	tables: unknown[];
}

const room: FakeClass = vi.hoisted(() => ({ roster: [], tables: [] }));
vi.mock('@/lib/classroom/classState', () => ({ classState: room }));

const data: { main: Statement | null } = vi.hoisted(() => ({ main: null }));
vi.mock('@/lib/classroom/projectorData', () => ({ projectorData: data }));
// The QR is drawn by a lazily loaded encoder; the step under test only places it.
vi.mock('../ProjectorBand', () => ({
	QR_WAITING_SIZE: 320,
	ProjectorQr: { view: () => m('.projector-qr.projector-qr--waiting') },
}));

const { renderStep } = await import('../steps');

const CODE = '482913';

function mount(code: string | undefined): HTMLElement {
	const root = document.createElement('div');
	document.body.appendChild(root);
	m.render(
		root,
		renderStep('waiting', { code, joinUrl: code ? `https://class.test/c/${code}` : undefined }),
	);

	return root.firstElementChild as HTMLElement;
}

beforeEach(() => {
	data.main = { statementId: 'm', creatorId: 'teacher' } as unknown as Statement;
	room.roster = [{ userId: 'teacher' }, { userId: 'a' }, { userId: 'b' }, { userId: 'c' }];
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('projector join gate (the waiting step)', () => {
	it('keeps the plain code, the QR and the count exactly as before', () => {
		const step = mount(CODE);
		const code = step.querySelector('p.projector-code');

		expect(code?.textContent).toBe(CODE);
		expect(code?.getAttribute('dir')).toBe('ltr');
		expect(step.querySelector('.projector-qr--waiting')).not.toBeNull();
		expect(step.querySelector('p.projector-count')?.textContent).toBe('projector.inClass:3');
	});

	it('adds the code as digit tiles, hidden and never read out', () => {
		const tiles = mount(CODE).querySelector<HTMLElement>('.code-tiles');

		expect(tiles?.hidden).toBe(true);
		expect(tiles?.getAttribute('aria-hidden')).toBe('true');
		expect(tiles?.textContent).toBe(CODE);
	});

	it('adds one classmate orb per student who joined (not the teacher), hidden and never read out', () => {
		const orbs = mount(CODE).querySelector<HTMLElement>('.classmates');

		expect(orbs?.hidden).toBe(true);
		expect(orbs?.getAttribute('aria-hidden')).toBe('true');
		expect(orbs?.querySelectorAll('.classmates__orb')).toHaveLength(3);
		expect(orbs?.textContent).toBe('');
	});

	it('shows nothing new to a reader: the visible text is the code and the count only', () => {
		const step = mount(CODE);
		const shown = [...step.children].filter((child) => !(child as HTMLElement).hidden);

		expect(shown.map((child) => child.className)).toEqual([
			'projector-code',
			'projector-qr projector-qr--waiting',
			'projector-count',
		]);
	});

	it('draws no tiles while the lesson has no code yet', () => {
		const step = mount(undefined);

		expect(step.querySelector('.projector-code')).toBeNull();
		expect(step.querySelector('.code-tiles')).toBeNull();
	});

	it('the orbs carry the count and nothing else: no names, no sides', () => {
		const orbs = mount(CODE).querySelector<HTMLElement>('.classmates');
		const attributes = [...(orbs?.querySelectorAll('*') ?? [])].flatMap((orb) =>
			orb.getAttributeNames(),
		);

		expect(new Set(attributes)).toEqual(new Set(['class']));
	});
});
