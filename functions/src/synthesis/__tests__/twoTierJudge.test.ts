jest.mock('firebase-functions', () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

const mockJudgeCached = jest.fn();
jest.mock('../../services/verdict-cache-service', () => ({
	judgeSemanticEquivalenceCached: (...args: unknown[]) => mockJudgeCached(...args),
}));

import { twoTierJudge, pickMedoid, type ClusterMember } from '../twoTierJudge';
import type {
	EquivalencePair,
	EquivalenceResult,
} from '../../services/semantic-equivalence-service';

/**
 * twoTierJudge cuts LLM verification cost by:
 *   - auto-accepting cosine ≥ 0.94 (no LLM)
 *   - auto-rejecting cosine < 0.82 (no LLM)
 *   - LLM only on the gray band [0.82, 0.94)
 *   - judging member↔medoid (linear) instead of all-pairs (quadratic)
 *
 * These tests pin those branches without making real LLM calls.
 */

function makeMember(id: string, text: string, base: number, dim = 8): ClusterMember {
	const embedding: number[] = new Array(dim);
	for (let i = 0; i < dim; i++) embedding[i] = base + i * 1e-6;

	return { id, text, embedding };
}

// Build a member with a target cosine to base = [1, 0, ...] AND mutually
// low cosine to all other members built the same way. Achieved by placing
// each member's "orthogonal" component in its OWN dimension, indexed by
// `axis`. This makes `base` unambiguously the medoid in every test below
// because it's equidistant to everyone while members are far from each
// other.
function memberWithCosineToBase(
	id: string,
	text: string,
	cos: number,
	axis: number,
	dim = 16,
): ClusterMember {
	const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
	const embedding: number[] = new Array(dim).fill(0);
	embedding[0] = cos;
	if (axis < 1 || axis >= dim) throw new Error('axis must be in [1, dim)');
	embedding[axis] = sin;

	return { id, text, embedding };
}

const baseMedoid: ClusterMember = (() => {
	const dim = 16;
	const embedding: number[] = new Array(dim).fill(0);
	embedding[0] = 1;

	return { id: 'medoid', text: 'medoid text', embedding };
})();

beforeEach(() => {
	mockJudgeCached.mockReset();
});

describe('pickMedoid', () => {
	it('returns the only member when given one', () => {
		const m = makeMember('a', 't', 0.5);
		const embeddings = new Map([[m.id, m.embedding]]);
		expect(pickMedoid([m.id], embeddings)).toBe('a');
	});

	it('picks the member with highest mean cosine to the others', () => {
		// a, b are tightly clustered around base=0.1; c is an outlier.
		// medoid should be a or b (high mean to each other), not c.
		const a = makeMember('a', 'a', 0.1);
		const b = makeMember('b', 'b', 0.1);
		const c: ClusterMember = (() => {
			const dim = 8;
			const embedding = new Array(dim).fill(0);
			embedding[7] = 1; // orthogonal to a, b which span the first dims

			return { id: 'c', text: 'c', embedding };
		})();
		const embeddings = new Map([
			[a.id, a.embedding],
			[b.id, b.embedding],
			[c.id, c.embedding],
		]);
		const medoid = pickMedoid([a.id, b.id, c.id], embeddings);
		expect(['a', 'b']).toContain(medoid);
	});
});

describe('twoTierJudge', () => {
	it('auto-accepts members with cosine >= 0.94 without calling LLM', async () => {
		const m1 = memberWithCosineToBase('m1', 't1', 0.99, 1);
		const m2 = memberWithCosineToBase('m2', 't2', 0.96, 2);
		const members = new Map<string, ClusterMember>([
			[baseMedoid.id, baseMedoid],
			[m1.id, m1],
			[m2.id, m2],
		]);

		const result = await twoTierJudge(
			[{ clusterId: 'c1', memberIds: [baseMedoid.id, m1.id, m2.id] }],
			members,
		);

		expect(mockJudgeCached).not.toHaveBeenCalled();
		expect(result.stats.autoAcceptCount).toBe(2);
		expect(result.stats.autoRejectCount).toBe(0);
		expect(result.stats.grayBandCount).toBe(0);
		expect(result.verifiedClusters).toHaveLength(1);
		expect(result.verifiedClusters[0].verifiedBy).toBe('cosine+llm');
		expect(result.verifiedClusters[0].memberIds.sort()).toEqual(['m1', 'm2', 'medoid']);
	});

	it('auto-rejects members with cosine < 0.82 without calling LLM', async () => {
		// All four members are far from medoid → cluster fails the keepThreshold.
		const far1 = memberWithCosineToBase('f1', 'f1', 0.5, 1);
		const far2 = memberWithCosineToBase('f2', 'f2', 0.4, 2);
		const far3 = memberWithCosineToBase('f3', 'f3', 0.3, 3);
		const members = new Map<string, ClusterMember>([
			[baseMedoid.id, baseMedoid],
			[far1.id, far1],
			[far2.id, far2],
			[far3.id, far3],
		]);

		const result = await twoTierJudge(
			[{ clusterId: 'c1', memberIds: [baseMedoid.id, far1.id, far2.id, far3.id] }],
			members,
		);

		expect(mockJudgeCached).not.toHaveBeenCalled();
		expect(result.stats.autoRejectCount).toBe(3);
		expect(result.verifiedClusters).toHaveLength(0);
		expect(result.droppedClusters).toHaveLength(1);
	});

	it('routes gray-band [0.82, 0.94) members through the LLM judge', async () => {
		const gray1 = memberWithCosineToBase('g1', 'g1', 0.88, 1);
		const gray2 = memberWithCosineToBase('g2', 'g2', 0.85, 2);
		const members = new Map<string, ClusterMember>([
			[baseMedoid.id, baseMedoid],
			[gray1.id, gray1],
			[gray2.id, gray2],
		]);

		mockJudgeCached.mockImplementation(async (pairs: EquivalencePair[]) => {
			return pairs.map((p) => ({
				pairId: p.pairId,
				verdict: 'same',
				reason: 'mocked',
			})) as EquivalenceResult[];
		});

		const result = await twoTierJudge(
			[{ clusterId: 'c1', memberIds: [baseMedoid.id, gray1.id, gray2.id] }],
			members,
		);

		expect(mockJudgeCached).toHaveBeenCalledTimes(1);
		const calledPairs = mockJudgeCached.mock.calls[0][0] as EquivalencePair[];
		expect(calledPairs).toHaveLength(2);
		expect(result.stats.grayBandCount).toBe(2);
		expect(result.stats.llmCallsMade).toBe(2);
		expect(result.verifiedClusters).toHaveLength(1);
	});

	it('drops a cluster when fewer than splitFloor (50%) members agree', async () => {
		// 1 medoid + 3 members. Auto-rejected (cosine 0.4) → 0% agreement
		// 0/3 = 0 < 0.5 floor → cluster dropped.
		const m1 = memberWithCosineToBase('m1', 'm1', 0.4, 1);
		const m2 = memberWithCosineToBase('m2', 'm2', 0.4, 2);
		const m3 = memberWithCosineToBase('m3', 'm3', 0.4, 3);
		const members = new Map<string, ClusterMember>([
			[baseMedoid.id, baseMedoid],
			[m1.id, m1],
			[m2.id, m2],
			[m3.id, m3],
		]);

		const result = await twoTierJudge(
			[{ clusterId: 'c1', memberIds: [baseMedoid.id, m1.id, m2.id, m3.id] }],
			members,
		);

		expect(result.verifiedClusters).toHaveLength(0);
		expect(result.droppedClusters).toHaveLength(1);
	});

	it('respects the maxLlmCalls cap and marks remaining clusters cosine-only', async () => {
		// Two clusters, each with one gray-band member. Cap = 1 → first cluster's
		// gray pair gets LLM, second gets cosine-only fallback.
		const grayA = memberWithCosineToBase('gA', 'gA', 0.87, 1);
		const grayB = memberWithCosineToBase('gB', 'gB', 0.87, 2);
		const accept1 = memberWithCosineToBase('a1', 'a1', 0.99, 3);
		const accept2 = memberWithCosineToBase('a2', 'a2', 0.99, 4);
		const medoid2: ClusterMember = {
			id: 'medoid2',
			text: 'm2 text',
			embedding: baseMedoid.embedding,
		};
		const members = new Map<string, ClusterMember>([
			[baseMedoid.id, baseMedoid],
			[medoid2.id, medoid2],
			[grayA.id, grayA],
			[grayB.id, grayB],
			[accept1.id, accept1],
			[accept2.id, accept2],
		]);

		mockJudgeCached.mockImplementation(async (pairs: EquivalencePair[]) => {
			return pairs.map((p) => ({
				pairId: p.pairId,
				verdict: 'same',
				reason: 'mocked',
			})) as EquivalenceResult[];
		});

		const result = await twoTierJudge(
			[
				{ clusterId: 'c1', memberIds: [baseMedoid.id, accept1.id, grayA.id] },
				{ clusterId: 'c2', memberIds: [medoid2.id, accept2.id, grayB.id] },
			],
			members,
			{ maxLlmCalls: 1 },
		);

		expect(result.stats.llmCallsCapped).toBe(true);
		expect(result.stats.llmCallsMade).toBe(1);
		// Both clusters should be kept; one is cosine+llm, the other cosine-only.
		expect(result.verifiedClusters).toHaveLength(2);
		const cosineOnly = result.verifiedClusters.filter((c) => c.verifiedBy === 'cosine-only');
		expect(cosineOnly).toHaveLength(1);
	});

	it('drops singleton-only clusters as not meaningfully verifiable', async () => {
		const m1 = memberWithCosineToBase('m1', 'm1', 0.99, 1);
		const members = new Map<string, ClusterMember>([[m1.id, m1]]);

		const result = await twoTierJudge([{ clusterId: 'c1', memberIds: [m1.id] }], members);

		expect(result.verifiedClusters).toHaveLength(0);
		expect(result.droppedClusters).toHaveLength(1);
		expect(result.droppedClusters[0].reason).toBe('singleton');
	});
});
