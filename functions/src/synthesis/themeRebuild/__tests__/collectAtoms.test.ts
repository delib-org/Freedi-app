import type { Statement } from '@freedi/shared-types';

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../services/integration-ai-service', () => ({
	assignToTheme: jest.fn(),
	generateTopicLabel: jest.fn(),
}));
jest.mock('../../liveSynth/auditLog', () => ({ recordLiveSynthEvent: jest.fn() }));
jest.mock('../../liveSynth/clusterRecompute', () => ({
	enqueueClusterRecompute: jest.fn(),
	findClustersContainingMember: jest.fn(async () => []),
}));
const liveThemesMock = jest.fn();
jest.mock('../../pipeline/nestSynthesis', () => ({
	liveThemes: (...args: unknown[]) => liveThemesMock(...args),
}));

import { collectAtoms, selectAtoms, selectLiveThemes, toRebuildAtom } from '../collectAtoms';

const option = (id: string, extra: Record<string, unknown> = {}): Statement =>
	({
		statementId: id,
		statement: `title ${id}`,
		statementType: 'option',
		parentId: 'q',
		createdAt: 1,
		...extra,
	}) as unknown as Statement;

const synth = (id: string, members: string[], extra: Record<string, unknown> = {}): Statement =>
	option(id, {
		isCluster: true,
		derivedByPipeline: 'synthesis',
		integratedOptions: members,
		...extra,
	});

const theme = (id: string, members: string[], extra: Record<string, unknown> = {}): Statement =>
	option(id, {
		isCluster: true,
		derivedByPipeline: 'topic-cluster',
		integratedOptions: members,
		...extra,
	});

describe('selectAtoms', () => {
	const all = [
		synth('s1', ['o1', 'o2']),
		option('o1'),
		option('o2'),
		option('o3'),
		option('o4', { hide: true }),
		synth('s2', ['o5'], { hide: true }),
		option('o5'),
		theme('t1', ['s1', 'o3']),
		theme('t2', [], { isCluster: true }),
	];

	it('is every visible synth plus every visible option in no visible synth', () => {
		expect(
			selectAtoms(all)
				.map((s) => s.statementId)
				.sort(),
		).toEqual(['o3', 'o5', 's1']);
	});

	it('includes atoms that are already themed (no unthemed filter)', () => {
		expect(selectAtoms(all).map((s) => s.statementId)).toContain('o3');
	});

	it('never counts a theme doc as an atom', () => {
		const ids = selectAtoms(all).map((s) => s.statementId);
		expect(ids).not.toContain('t1');
		expect(ids).not.toContain('t2');
	});

	it('selectLiveThemes returns visible topic clusters only', () => {
		const withHidden = [...all, theme('t3', ['o5'], { hide: true })];
		expect(selectLiveThemes(withHidden).map((s) => s.statementId)).toEqual(['t1']);
	});
});

describe('toRebuildAtom', () => {
	it('is the title plus a shortened description', () => {
		const atom = toRebuildAtom(
			option('o1', { statement: 'Plant trees', description: 'x'.repeat(400) }),
		);
		expect(atom.text.startsWith('Plant trees — ')).toBe(true);
		expect(atom.text.length).toBeLessThan(200);
		expect(atom.isSynth).toBe(false);
	});

	it('is just the title when there is no description', () => {
		expect(toRebuildAtom(synth('s1', ['a'])).text).toBe('title s1');
	});
});

describe('collectAtoms', () => {
	it('returns atoms and the uncapped live theme list', async () => {
		liveThemesMock.mockResolvedValue({
			themes: [],
			titleById: new Map(),
			all: [option('o1'), theme('t1', ['o1'])],
		});

		const result = await collectAtoms('q');

		expect(result.atoms.map((a) => a.id)).toEqual(['o1']);
		expect(result.liveThemes.map((t) => t.statementId)).toEqual(['t1']);
	});
});
