import { computeOtherIdeas, type IdeaNode } from '../otherIdeas';

function option(id: string, extra: Partial<IdeaNode> = {}): IdeaNode {
	return { statementId: id, statementType: 'option', ...extra };
}

function theme(id: string, members: string[], extra: Partial<IdeaNode> = {}): IdeaNode {
	return option(id, {
		isCluster: true,
		derivedByPipeline: 'topic-cluster',
		integratedOptions: members,
		...extra,
	});
}

function synthesis(id: string, members: string[], extra: Partial<IdeaNode> = {}): IdeaNode {
	return option(id, {
		isCluster: true,
		derivedByPipeline: 'synthesis',
		integratedOptions: members,
		...extra,
	});
}

const ids = (nodes: IdeaNode[]): string[] => nodes.map((n) => n.statementId);

describe('computeOtherIdeas', () => {
	it('returns nothing for an empty question', () => {
		const result = computeOtherIdeas([]);
		expect(result.atoms).toEqual([]);
		expect(result.otherAtoms).toEqual([]);
		expect(result.hasThemes).toBe(false);
	});

	it('puts every atom in Other when there are no themes', () => {
		const result = computeOtherIdeas([
			option('a'),
			option('b'),
			synthesis('s', ['c']),
			option('c'),
		]);
		expect(result.hasThemes).toBe(false);
		expect(ids(result.otherAtoms)).toEqual(['a', 'b', 's']);
		expect(result.themeIdByAtomId.size).toBe(0);
	});

	it('keeps an option listed by a visible theme out of Other', () => {
		const result = computeOtherIdeas([theme('t', ['a']), option('a'), option('b')]);
		expect(ids(result.otherAtoms)).toEqual(['b']);
		expect(result.themeIdByAtomId.get('a')).toBe('t');
		expect(result.hasThemes).toBe(true);
	});

	it('does not count a synthesis member as an atom', () => {
		const result = computeOtherIdeas([
			synthesis('s', ['a', 'b']),
			option('a'),
			option('b'),
			option('c'),
		]);
		expect(ids(result.atoms)).toEqual(['s', 'c']);
		expect(ids(result.otherAtoms)).toEqual(['s', 'c']);
	});

	it('nests a synthesis the theme lists directly', () => {
		const result = computeOtherIdeas([theme('t', ['s']), synthesis('s', ['a']), option('a')]);
		expect(ids(result.otherAtoms)).toEqual([]);
		expect(result.themeIdByAtomId.get('s')).toBe('t');
	});

	it('nests a legacy synthesis through shared members, picking the largest overlap', () => {
		const result = computeOtherIdeas([
			theme('t1', ['a']),
			theme('t2', ['b', 'c']),
			synthesis('s', ['a', 'b', 'c']),
			option('a'),
			option('b'),
			option('c'),
		]);
		expect(result.themeIdByAtomId.get('s')).toBe('t2');
		expect(ids(result.otherAtoms)).toEqual([]);
	});

	it('breaks overlap ties toward the earlier theme', () => {
		const result = computeOtherIdeas([
			theme('t1', ['a']),
			theme('t2', ['b']),
			synthesis('s', ['a', 'b']),
		]);
		expect(result.themeIdByAtomId.get('s')).toBe('t1');
	});

	it('sends a synthesis sharing nothing with a theme to Other', () => {
		const result = computeOtherIdeas([theme('t', ['x']), synthesis('s', ['a']), option('a')]);
		expect(ids(result.otherAtoms)).toEqual(['s']);
	});

	it('ignores hidden themes, hidden syntheses and hidden options', () => {
		const result = computeOtherIdeas([
			theme('t', ['a'], { hide: true }),
			synthesis('s', ['b'], { hide: true }),
			option('a'),
			option('b'),
			option('h', { hide: true }),
		]);
		expect(result.hasThemes).toBe(false);
		expect(ids(result.otherAtoms)).toEqual(['a', 'b']);
	});

	it('ignores statements that are not options', () => {
		const result = computeOtherIdeas([
			{ statementId: 'q', statementType: 'question' },
			{ statementId: 'm', statementType: 'statement' },
			option('a'),
		]);
		expect(ids(result.atoms)).toEqual(['a']);
	});

	it('treats a cluster without a pipeline as a theme', () => {
		const result = computeOtherIdeas([
			option('t', { isCluster: true, integratedOptions: ['a'] }),
			option('a'),
		]);
		expect(result.hasThemes).toBe(true);
		expect(result.otherAtoms).toEqual([]);
	});

	it('counts a lone leftover as one atom', () => {
		const result = computeOtherIdeas([theme('t', ['a']), option('a'), option('b')]);
		expect(result.otherAtoms).toHaveLength(1);
	});

	it('preserves input order', () => {
		const result = computeOtherIdeas([option('z'), option('y'), option('x')]);
		expect(ids(result.otherAtoms)).toEqual(['z', 'y', 'x']);
	});
});
