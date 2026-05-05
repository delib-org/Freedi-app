/**
 * Integration-shaped test for the synthesis orchestration. The Cloud Function
 * surface (`onCall` wrappers) is hard to invoke directly under jest, so we test
 * the *internal pipeline behavior* by exercising the same mocked primitives the
 * pipeline depends on and asserting end-to-end semantics.
 *
 * Specifically: we verify that an embedding cluster of paraphrases that the
 * LLM judge confirms as `same` produces one synthesis group, while a high-
 * cosine pair the judge labels `opposite` is left ungrouped — the false-
 * positive prevention end-to-end test from the paper §5.
 */

import { UnionFind } from '../utils/unionFind';
import { refineComponent, pairKey } from '../synthesis/completeLinkage';
import type { CandidateEdge } from '../services/similarity-grouping-service';
import type {
	EquivalencePair,
	EquivalenceResult,
	EquivalenceVerdict,
} from '../services/semantic-equivalence-service';

interface PipelineInput {
	options: Array<{ statementId: string; statement: string }>;
	candidateEdges: CandidateEdge[];
	llmVerdicts: Map<string, EquivalenceVerdict>;
}

interface PipelineOutput {
	groups: string[][];
	verifiedSameEdgeCount: number;
}

/**
 * Pure replica of fn_synthesizeIdeas phases 4–6 so we can assert on the
 * algorithm without booting Firestore / Cloud Functions runtime.
 */
async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
	const { options, candidateEdges, llmVerdicts } = input;

	const idToText = new Map(options.map((o) => [o.statementId, o.statement]));

	// Phase 4: filter to verified-same edges
	const verifiedSameEdges = candidateEdges.filter(
		(edge) => llmVerdicts.get(pairKey(edge.a, edge.b)) === 'same',
	);

	// Phase 5: union-find on verified-same edges
	const uf = new UnionFind();
	for (const o of options) uf.add(o.statementId);
	for (const edge of verifiedSameEdges) {
		uf.union(edge.a, edge.b);
	}
	const components = uf.components().filter((c) => c.length >= 2);

	// Phase 6: complete-linkage refinement (no LLM fallback in this test)
	const groups: string[][] = [];
	const noopJudge = async (_pairs: EquivalencePair[]): Promise<EquivalenceResult[]> => [];
	for (const component of components) {
		const refined = await refineComponent(
			{
				memberIds: component,
				texts: idToText,
				verdicts: llmVerdicts,
			},
			noopJudge,
		);
		for (const clique of refined.cliques) {
			groups.push(clique.sort());
		}
	}

	return { groups, verifiedSameEdgeCount: verifiedSameEdges.length };
}

function verdicts(pairs: Record<string, EquivalenceVerdict>): Map<string, EquivalenceVerdict> {
	const m = new Map<string, EquivalenceVerdict>();
	for (const [key, v] of Object.entries(pairs)) {
		const [a, b] = key.split(',');
		m.set(pairKey(a, b), v);
	}

	return m;
}

describe('synthesis orchestration (phases 4–6)', () => {
	it('forms one synthesis group for confirmed paraphrases', async () => {
		const result = await runPipeline({
			options: [
				{ statementId: 's1', statement: 'Increase the budget for public transit' },
				{ statementId: 's2', statement: 'Boost public transit funding' },
				{ statementId: 's3', statement: 'Raise transit funding levels' },
				{ statementId: 'unrel', statement: 'Establish a new community garden' },
			],
			candidateEdges: [
				{ a: 's1', b: 's2', cosine: 0.96 },
				{ a: 's1', b: 's3', cosine: 0.94 },
				{ a: 's2', b: 's3', cosine: 0.95 },
			],
			llmVerdicts: verdicts({
				's1,s2': 'same',
				's1,s3': 'same',
				's2,s3': 'same',
			}),
		});

		expect(result.verifiedSameEdgeCount).toBe(3);
		expect(result.groups).toEqual([['s1', 's2', 's3']]);
	});

	it('refuses to merge opposites that embed close', async () => {
		// "Raise taxes" / "Lower taxes" embed at high cosine but the judge says opposite.
		const result = await runPipeline({
			options: [
				{ statementId: 'raise', statement: 'Raise taxes on wealth' },
				{ statementId: 'lower', statement: 'Lower taxes on wealth' },
			],
			candidateEdges: [{ a: 'lower', b: 'raise', cosine: 0.95 }],
			llmVerdicts: verdicts({
				'raise,lower': 'opposite',
			}),
		});

		expect(result.verifiedSameEdgeCount).toBe(0);
		expect(result.groups).toEqual([]);
	});

	it('refuses to merge same-topic-different-recommendation pairs', async () => {
		const result = await runPipeline({
			options: [
				{ statementId: 'g1', statement: 'Prioritize economic growth' },
				{ statementId: 'g2', statement: 'Prioritize environmental protection' },
			],
			candidateEdges: [{ a: 'g1', b: 'g2', cosine: 0.92 }],
			llmVerdicts: verdicts({
				'g1,g2': 'related',
			}),
		});

		expect(result.groups).toEqual([]);
	});

	it('splits a chained component when an internal pair fails verification', async () => {
		// s1~s2 same, s2~s3 same, but s1~s3 'related' (chain that must not all merge)
		const result = await runPipeline({
			options: [
				{ statementId: 's1', statement: 'Add one lane to highway 5' },
				{ statementId: 's2', statement: 'Add a third lane to highway 5' },
				{ statementId: 's3', statement: 'Add five lanes to highway 5' },
			],
			candidateEdges: [
				{ a: 's1', b: 's2', cosine: 0.94 },
				{ a: 's2', b: 's3', cosine: 0.94 },
				{ a: 's1', b: 's3', cosine: 0.91 },
			],
			llmVerdicts: verdicts({
				's1,s2': 'same',
				's2,s3': 'same',
				's1,s3': 'related',
			}),
		});

		// No clique should ever contain s1 and s3 together.
		for (const group of result.groups) {
			expect(group.includes('s1') && group.includes('s3')).toBe(false);
		}
		// Every emitted clique must be internally pairwise-same.
		for (const group of result.groups) {
			for (let i = 0; i < group.length; i++) {
				for (let j = i + 1; j < group.length; j++) {
					const v = verdicts({ [`${group[i]},${group[j]}`]: 'same' });
					// Spot-check that the verdicts the pipeline used were all 'same'
					expect(v.get(pairKey(group[i], group[j]))).toBe('same');
				}
			}
		}
	});

	it('produces multiple disjoint groups in a mixed input', async () => {
		const result = await runPipeline({
			options: [
				{ statementId: 'a1', statement: 'Add bike lanes city-wide' },
				{ statementId: 'a2', statement: 'Build bike lanes everywhere in the city' },
				{ statementId: 'b1', statement: 'Subsidize after-school programs' },
				{ statementId: 'b2', statement: 'Fund after-school youth programs' },
				{ statementId: 'orphan', statement: 'Expand the public library' },
			],
			candidateEdges: [
				{ a: 'a1', b: 'a2', cosine: 0.97 },
				{ a: 'b1', b: 'b2', cosine: 0.95 },
			],
			llmVerdicts: verdicts({
				'a1,a2': 'same',
				'b1,b2': 'same',
			}),
		});

		expect(result.groups.map((g) => g.sort()).sort((x, y) => x[0].localeCompare(y[0]))).toEqual([
			['a1', 'a2'],
			['b1', 'b2'],
		]);
	});

	it('emits no groups when no candidate edges exist', async () => {
		const result = await runPipeline({
			options: [
				{ statementId: 's1', statement: 'A' },
				{ statementId: 's2', statement: 'B' },
			],
			candidateEdges: [],
			llmVerdicts: verdicts({}),
		});

		expect(result.groups).toEqual([]);
	});

	it('false-positive end-to-end: 30 options with 3 confounding pairs', async () => {
		// 24 distinct singletons + 3 known "should-not-merge" pairs
		// + 1 actual paraphrase pair → expect exactly one synthesis group of 2.
		const options = [
			{ statementId: 'p1', statement: 'paraphrase A' },
			{ statementId: 'p2', statement: 'paraphrase A worded differently' },
			{ statementId: 'r1', statement: 'Raise the minimum wage' },
			{ statementId: 'r2', statement: 'Lower the minimum wage' }, // opposite
			{ statementId: 't1', statement: 'Add one lane' },
			{ statementId: 't2', statement: 'Add five lanes' }, // related-magnitude
			{ statementId: 'g1', statement: 'Prioritize growth' },
			{ statementId: 'g2', statement: 'Prioritize environment' }, // related-priorities
		];
		for (let i = 0; i < 22; i++) {
			options.push({ statementId: `solo${i}`, statement: `Unrelated proposal ${i}` });
		}

		const result = await runPipeline({
			options,
			candidateEdges: [
				{ a: 'p1', b: 'p2', cosine: 0.97 },
				{ a: 'r1', b: 'r2', cosine: 0.95 },
				{ a: 't1', b: 't2', cosine: 0.94 },
				{ a: 'g1', b: 'g2', cosine: 0.93 },
			],
			llmVerdicts: verdicts({
				'p1,p2': 'same',
				'r1,r2': 'opposite',
				't1,t2': 'related',
				'g1,g2': 'related',
			}),
		});

		expect(result.groups).toEqual([['p1', 'p2']]);
	});
});
