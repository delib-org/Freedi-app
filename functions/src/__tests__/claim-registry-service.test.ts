import type { Statement } from '@freedi/shared-types';
import {
	claimFieldsForSpawn,
	classifyAgainstClaims,
	classifyClaimChange,
	generateClaim,
	isAttachTarget,
	orderClaimsForClassification,
	readClaimFields,
	readClaimHierarchy,
	revalidateMembers,
	type ClusterClaim,
} from '../services/claim-registry-service';
import { callLLM } from '../config/openai-chat';

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: jest.fn(),
}));
jest.mock('firebase-functions', () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));
jest.mock('../config/openai-chat', () => ({
	...jest.requireActual('../config/openai-chat'),
	callLLM: jest.fn(),
}));

const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;

function makeClaims(texts: string[]): ClusterClaim[] {
	return texts.map((canonicalClaim, i) => ({
		clusterId: `cluster-${i + 1}`,
		canonicalClaim,
		publicExplanation: '',
		claimVersion: 1,
		claimStatus: 'provisional',
		claimUpdatedAt: 0,
		isSynth: false,
		memberCount: 2,
	}));
}

describe('claim-registry-service', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('classifyAgainstClaims', () => {
		const claims = makeClaims(['Add more bike lanes downtown', 'Lower city parking fees']);

		it('returns the matched cluster on an "expresses" verdict', async () => {
			mockCallLLM.mockResolvedValue(
				JSON.stringify({
					matchIndex: 1,
					relation: 'expresses',
					confidence: 0.9,
					reason: 'same proposal',
				}),
			);

			const result = await classifyAgainstClaims({
				statementText: 'We should build cycling paths in the city center',
				questionText: 'How to improve transport?',
				claims,
			});

			expect(result.matchedClusterId).toBe('cluster-1');
			expect(result.relation).toBe('expresses');
			expect(result.confidence).toBe(0.9);
		});

		it('never matches on an "opposes" verdict (opposite-meaning guard)', async () => {
			mockCallLLM.mockResolvedValue(
				JSON.stringify({ matchIndex: 2, relation: 'opposes', confidence: 0.95, reason: '' }),
			);

			const result = await classifyAgainstClaims({
				statementText: 'Raise parking fees substantially',
				questionText: 'How to improve transport?',
				claims,
			});

			expect(result.matchedClusterId).toBeNull();
			expect(result.relation).toBe('opposes');
			// The contradiction edge is preserved (pro/con structure), not discarded.
			expect(result.opposedClusterId).toBe('cluster-2');
		});

		it('leaves opposedClusterId empty on an "expresses" verdict', async () => {
			mockCallLLM.mockResolvedValue(
				JSON.stringify({ matchIndex: 1, relation: 'expresses', confidence: 0.9, reason: '' }),
			);

			const result = await classifyAgainstClaims({
				statementText: 'x',
				questionText: 'q',
				claims,
			});

			expect(result.opposedClusterId).toBeNull();
		});

		it('returns no match for "none"', async () => {
			mockCallLLM.mockResolvedValue(
				JSON.stringify({ matchIndex: null, relation: 'none', confidence: 0.2, reason: '' }),
			);

			const result = await classifyAgainstClaims({
				statementText: 'Plant more trees',
				questionText: 'How to improve transport?',
				claims,
			});

			expect(result.matchedClusterId).toBeNull();
			expect(result.relation).toBe('none');
		});

		it('treats an out-of-range match index as no match', async () => {
			mockCallLLM.mockResolvedValue(
				JSON.stringify({ matchIndex: 99, relation: 'expresses', confidence: 0.9, reason: '' }),
			);

			const result = await classifyAgainstClaims({
				statementText: 'anything',
				questionText: 'q',
				claims,
			});

			expect(result.matchedClusterId).toBeNull();
			expect(result.relation).toBe('none');
		});

		it('skips the LLM entirely when the codebook is empty', async () => {
			const result = await classifyAgainstClaims({
				statementText: 'anything',
				questionText: 'q',
				claims: [],
			});

			expect(result.matchedClusterId).toBeNull();
			expect(mockCallLLM).not.toHaveBeenCalled();
		});

		it('fails closed (no match) on LLM error, marked as failedClosed', async () => {
			mockCallLLM.mockRejectedValue(new Error('rate limited'));

			const result = await classifyAgainstClaims({
				statementText: 'anything',
				questionText: 'q',
				claims,
			});

			expect(result.matchedClusterId).toBeNull();
			expect(result.relation).toBe('none');
			expect(result.failedClosed).toBe(true);
		});

		it('does NOT mark an honest LLM "none" verdict as failedClosed', async () => {
			mockCallLLM.mockResolvedValue(
				JSON.stringify({
					matchIndex: null,
					relation: 'none',
					confidence: 0.9,
					reason: 'unrelated',
				}),
			);

			const result = await classifyAgainstClaims({
				statementText: 'anything',
				questionText: 'q',
				claims,
			});

			expect(result.relation).toBe('none');
			expect(result.failedClosed).toBeUndefined();
		});

		it('renders enriched codebook lines (explanation + exemplar) into the prompt', async () => {
			mockCallLLM.mockResolvedValue(
				JSON.stringify({ matchIndex: 1, relation: 'expresses', confidence: 0.9, reason: '' }),
			);
			const enriched: ClusterClaim[] = [
				{
					...makeClaims(['Add more bike lanes downtown'])[0],
					publicExplanation: 'Build protected cycling paths in the city center.',
					exemplar: 'We really need safe places to ride bikes near the shops.',
				},
			];

			await classifyAgainstClaims({
				statementText: 'x',
				questionText: 'q',
				claims: enriched,
			});

			const user = mockCallLLM.mock.calls[0][0].user;
			expect(user).toContain(
				'1. Add more bike lanes downtown — Build protected cycling paths in the city center. (e.g.: "We really need safe places to ride bikes near the shops.")',
			);
		});

		it('renders a bare canonical line when explanation and exemplar add nothing', async () => {
			mockCallLLM.mockResolvedValue(
				JSON.stringify({ matchIndex: null, relation: 'none', confidence: 0.5, reason: 'x' }),
			);
			const bare: ClusterClaim[] = [
				{
					...makeClaims(['Add more bike lanes downtown'])[0],
					exemplar: 'Add more bike lanes downtown',
				},
			];

			await classifyAgainstClaims({ statementText: 'x', questionText: 'q', claims: bare });

			const user = mockCallLLM.mock.calls[0][0].user;
			expect(user).toContain('1. Add more bike lanes downtown\n');
			expect(user).not.toContain('e.g.');
		});

		it('clamps confidence into [0, 1]', async () => {
			mockCallLLM.mockResolvedValue(
				JSON.stringify({ matchIndex: 1, relation: 'expresses', confidence: 7, reason: '' }),
			);

			const result = await classifyAgainstClaims({
				statementText: 'x',
				questionText: 'q',
				claims,
			});

			expect(result.confidence).toBe(1);
		});
	});

	describe('classifyClaimChange', () => {
		it('returns reword without an LLM call when texts are identical', async () => {
			const change = await classifyClaimChange('Add bike lanes', 'Add bike lanes');

			expect(change).toBe('reword');
			expect(mockCallLLM).not.toHaveBeenCalled();
		});

		it.each(['reword', 'broaden', 'narrow', 'different'] as const)(
			'passes through a valid "%s" verdict',
			async (verdict) => {
				mockCallLLM.mockResolvedValue(JSON.stringify({ change: verdict }));

				expect(await classifyClaimChange('old claim', 'new claim')).toBe(verdict);
			},
		);

		it('falls back to different (forces re-validation) on garbage output', async () => {
			mockCallLLM.mockResolvedValue(JSON.stringify({ change: 'sideways' }));

			expect(await classifyClaimChange('old', 'new')).toBe('different');
		});

		it('falls back to different on LLM error', async () => {
			mockCallLLM.mockRejectedValue(new Error('boom'));

			expect(await classifyClaimChange('old', 'new')).toBe('different');
		});
	});

	describe('revalidateMembers', () => {
		const members = [
			{ statementId: 'a', brief: 'build bike lanes' },
			{ statementId: 'b', brief: 'reduce parking fees' },
			{ statementId: 'c', brief: 'more cycling paths' },
		];

		it('splits members into valid and detached from the verdict indices', async () => {
			mockCallLLM.mockResolvedValue(JSON.stringify({ validIndices: [1, 3] }));

			const result = await revalidateMembers('Expand cycling infrastructure', members);

			expect(result.validIds).toEqual(['a', 'c']);
			expect(result.detachedIds).toEqual(['b']);
		});

		it('keeps all members (fails open) on LLM error', async () => {
			mockCallLLM.mockRejectedValue(new Error('boom'));

			const result = await revalidateMembers('claim', members);

			expect(result.validIds).toEqual(['a', 'b', 'c']);
			expect(result.detachedIds).toEqual([]);
		});

		it('keeps all members on a malformed response', async () => {
			mockCallLLM.mockResolvedValue(JSON.stringify({ validIndices: 'all of them' }));

			const result = await revalidateMembers('claim', members);

			expect(result.detachedIds).toEqual([]);
		});

		it('ignores out-of-range indices', async () => {
			mockCallLLM.mockResolvedValue(JSON.stringify({ validIndices: [1, 99, -3] }));

			const result = await revalidateMembers('claim', members);

			expect(result.validIds).toEqual(['a']);
			expect(result.detachedIds).toEqual(['b', 'c']);
		});

		it('returns immediately for an empty member list', async () => {
			const result = await revalidateMembers('claim', []);

			expect(result.validIds).toEqual([]);
			expect(mockCallLLM).not.toHaveBeenCalled();
		});
	});

	describe('generateClaim', () => {
		it('returns the generated claim and explanation', async () => {
			mockCallLLM.mockResolvedValue(
				JSON.stringify({
					canonicalClaim: 'Add protected bike lanes downtown',
					publicExplanation: 'The city should build safe, separated cycling paths.',
				}),
			);

			const result = await generateClaim({
				questionText: 'How to improve transport?',
				texts: ['I think we really need some proper bike lanes, protected ones, downtown'],
			});

			expect(result.canonicalClaim).toBe('Add protected bike lanes downtown');
			expect(result.publicExplanation).toContain('separated cycling paths');
		});

		it('falls back to truncated source text when the LLM omits the claim', async () => {
			mockCallLLM.mockResolvedValue(JSON.stringify({ publicExplanation: 'only this' }));

			const result = await generateClaim({ questionText: 'q', texts: ['original statement'] });

			expect(result.canonicalClaim).toBe('original statement');
			expect(result.publicExplanation).toBe('');
		});

		it('falls back on LLM error', async () => {
			mockCallLLM.mockRejectedValue(new Error('boom'));

			const result = await generateClaim({ questionText: 'q', texts: ['original statement'] });

			expect(result.canonicalClaim).toBe('original statement');
		});
	});

	describe('readClaimFields / claimFieldsForSpawn', () => {
		it('returns null for a cluster without a canonical claim', () => {
			const cluster = { statementId: 'x', statement: 'title' } as unknown as Statement;

			expect(readClaimFields(cluster)).toBeNull();
		});

		it('reads claim fields with defaults for missing optional values', () => {
			const cluster = {
				statementId: 'x',
				canonicalClaim: 'Add bike lanes',
			} as unknown as Statement;

			const fields = readClaimFields(cluster);

			expect(fields).toEqual({
				canonicalClaim: 'Add bike lanes',
				publicExplanation: '',
				claimVersion: 1,
				claimStatus: 'provisional',
				claimUpdatedAt: 0,
			});
		});

		it('stamps spawns as provisional version 1', () => {
			const fields = claimFieldsForSpawn('claim text', 'explanation');

			expect(fields.claimVersion).toBe(1);
			expect(fields.claimStatus).toBe('provisional');
			expect(fields.canonicalClaim).toBe('claim text');
			expect(fields.publicExplanation).toBe('explanation');
		});

		it('seeds the broaden-ratchet anchor at spawn', () => {
			const fields = claimFieldsForSpawn('claim text', 'explanation');

			expect(fields.claimAnchorText).toBe('claim text');
			expect(fields.claimBroadensSinceAnchor).toBe(0);
		});

		it('spawns as a root-level specific claim (hierarchy defaults)', () => {
			const fields = claimFieldsForSpawn('claim text', 'explanation');

			expect(fields.claimLevel).toBe('specific');
			expect(fields.parentClaimId).toBeNull();
			expect(fields.childClaimIds).toEqual([]);
		});
	});

	describe('readClaimHierarchy / isAttachTarget', () => {
		it('defaults to a root-level specific claim on a doc without hierarchy fields', () => {
			const cluster = { statementId: 'x', canonicalClaim: 'c' } as unknown as Statement;

			expect(readClaimHierarchy(cluster)).toEqual({
				parentClaimId: null,
				claimLevel: 'specific',
				childClaimIds: [],
			});
		});

		it('reads explicit hierarchy fields and drops malformed child ids', () => {
			const cluster = {
				statementId: 'topic-1',
				canonicalClaim: 'Transportation',
				claimLevel: 'topic',
				parentClaimId: null,
				childClaimIds: ['a', 42, 'b', null],
			} as unknown as Statement;

			expect(readClaimHierarchy(cluster)).toEqual({
				parentClaimId: null,
				claimLevel: 'topic',
				childClaimIds: ['a', 'b'],
			});
		});

		it('topic claims are never attach targets; specific and legacy claims are', () => {
			expect(isAttachTarget({ claimLevel: 'topic' })).toBe(false);
			expect(isAttachTarget({ claimLevel: 'specific' })).toBe(true);
			expect(isAttachTarget({})).toBe(true);
		});
	});

	describe('orderClaimsForClassification', () => {
		it('puts claims with cosine evidence first, descending', () => {
			const claims = makeClaims(['a', 'b', 'c']);
			const cosine = new Map([
				['cluster-1', 0.5],
				['cluster-3', 0.8],
			]);

			const ordered = orderClaimsForClassification(claims, cosine);

			expect(ordered.map((c) => c.clusterId)).toEqual(['cluster-3', 'cluster-1', 'cluster-2']);
		});

		it('breaks ties by member count (larger claims are the likelier match)', () => {
			const claims = makeClaims(['a', 'b', 'c']);
			claims[2].memberCount = 9;

			const ordered = orderClaimsForClassification(claims, new Map());

			expect(ordered[0].clusterId).toBe('cluster-3');
		});

		it('never adds or drops claims (pure reorder)', () => {
			const claims = makeClaims(['a', 'b', 'c', 'd']);

			const ordered = orderClaimsForClassification(claims, new Map([['cluster-2', 0.7]]));

			expect(ordered).toHaveLength(claims.length);
			expect(new Set(ordered.map((c) => c.clusterId))).toEqual(
				new Set(claims.map((c) => c.clusterId)),
			);
			// Input untouched.
			expect(claims.map((c) => c.clusterId)).toEqual([
				'cluster-1',
				'cluster-2',
				'cluster-3',
				'cluster-4',
			]);
		});
	});
});
