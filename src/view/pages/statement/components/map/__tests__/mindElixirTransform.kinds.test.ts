/**
 * The three node kinds on the mind map — theme, merged idea, original — each
 * carry their own glyph, count pill and tag class (the stylesheet keys the
 * silhouette off the class), and a folded node is handed to MindElixir as
 * `expanded: false` rather than pruned.
 */

jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('@freedi/shared-types', () => ({ StatementType: {} }));

import { toMindElixirData, type FreediNodeObj } from '../mapHelpers/mindElixirTransform';
import { applyDetailLevel } from '../mapHelpers/detailLevel';
import type { Results, Statement } from '@freedi/shared-types';

type Opts = { isCluster?: boolean; derivedByPipeline?: 'synthesis' | 'topic-cluster' };

function s(id: string, opts: Opts = {}): Statement {
	return { statementId: id, statement: id, parentId: 'q', ...opts } as unknown as Statement;
}
const topic = (id: string, sub: Results[] = []): Results => ({
	top: s(id, { isCluster: true, derivedByPipeline: 'topic-cluster' }),
	sub,
});
const synth = (id: string, sub: Results[] = []): Results => ({
	top: s(id, { isCluster: true, derivedByPipeline: 'synthesis' }),
	sub,
});
const raw = (id: string): Results => ({ top: s(id), sub: [] });

const tree: Results = {
	top: s('q'),
	sub: [
		topic('topic', [synth('synth', [raw('a'), raw('b'), raw('c')]), raw('d')]),
		synth('lone', [raw('e')]),
		raw('f'),
	],
};

function byId(root: FreediNodeObj, id: string): FreediNodeObj | undefined {
	if (root.id === id) return root;
	for (const child of root.children ?? []) {
		const hit = byId(child as FreediNodeObj, id);
		if (hit) return hit;
	}

	return undefined;
}

function tagClasses(node: FreediNodeObj | undefined): string[] {
	return (node?.tags ?? []).map((tag) => (typeof tag === 'string' ? tag : (tag.className ?? '')));
}
function tagTexts(node: FreediNodeObj | undefined): string[] {
	return (node?.tags ?? []).map((tag) => (typeof tag === 'string' ? tag : tag.text));
}

describe('toMindElixirData — node kinds', () => {
	const root = toMindElixirData(tree).nodeData as FreediNodeObj;

	it('theme: # glyph, "ideas · merged" pill, topic tag class', () => {
		const node = byId(root, 'topic');
		expect(node?.icons).toEqual(['#']);
		expect(tagTexts(node)).toEqual(['2 ideas · 1 merged']);
		expect(tagClasses(node)).toEqual(['cluster-tag cluster-tag--topic']);
		expect(node?.branchColor).toBeDefined();
	});

	it('merged idea: ⧉ glyph, "voices" pill, synth tag class', () => {
		const node = byId(root, 'synth');
		expect(node?.icons).toEqual(['⧉']);
		expect(tagTexts(node)).toEqual(['3 voices']);
		expect(tagClasses(node)).toEqual(['cluster-tag cluster-tag--synth']);
	});

	it('merge of one: no stack, an "AI-titled" chip instead', () => {
		const node = byId(root, 'lone');
		expect(node?.icons).toBeUndefined();
		expect(tagClasses(node)).toEqual(['cluster-tag cluster-tag--ai-titled']);
	});

	it('original: no glyph, no tags', () => {
		const node = byId(root, 'f');
		expect(node?.icons).toBeUndefined();
		expect(node?.tags).toBeUndefined();
	});

	it('badges a node that holds one of the viewer’s statements', () => {
		const marked = toMindElixirData(tree, [], undefined, { markIds: new Set(['synth']) })
			.nodeData as FreediNodeObj;
		expect(tagClasses(byId(marked, 'synth'))).toEqual([
			'cluster-tag cluster-tag--synth',
			'cluster-tag cluster-tag--mine',
		]);
	});

	it('uses the injected wording', () => {
		const format = (badge: string, count: number) => `${badge}:${count}`;
		const node = byId(toMindElixirData(tree, [], format).nodeData as FreediNodeObj, 'topic');
		expect(tagTexts(node)).toEqual(['ideas:2 · merged:1']);
	});
});

describe('toMindElixirData — detail level', () => {
	it('folds nodes as expanded:false instead of dropping their children', () => {
		const leveled = applyDetailLevel(tree, 'ideas', new Set());
		const root = toMindElixirData(leveled).nodeData as FreediNodeObj;
		const synthNode = byId(root, 'synth');
		expect(synthNode?.expanded).toBe(false);
		expect(synthNode?.children).toHaveLength(3);
		expect(byId(root, 'topic')?.expanded).toBeUndefined();
	});

	it('a hand-expanded node stays open', () => {
		const leveled = applyDetailLevel(tree, 'ideas', new Set(['synth']));
		const root = toMindElixirData(leveled).nodeData as FreediNodeObj;
		expect(byId(root, 'synth')?.expanded).toBeUndefined();
	});
});
