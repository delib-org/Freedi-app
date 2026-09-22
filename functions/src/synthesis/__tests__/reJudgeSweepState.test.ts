import type { Statement } from '@freedi/shared-types';

/**
 * The reJudge sweep is a repair pass on a corpus that is static almost all of
 * the time, and it used to re-read that corpus every 10 minutes regardless —
 * ~187k Firestore reads/day on production against 21 writes/day, reporting zero
 * merges on every run. These tests pin the two gates that stop that, and pin
 * the thing that must NOT change: a gate may only skip work that genuinely has
 * nothing to do.
 */

const statementDocs = new Map<string, Statement>();
const sweepStateDocs = new Map<string, Record<string, unknown>>();

const SWEEP_COLLECTION = 'synthesisSweepState';

jest.mock('firebase-admin/firestore', () => {
	const store = (collectionName: string) =>
		collectionName === SWEEP_COLLECTION ? sweepStateDocs : statementDocs;

	const docRef = (collectionName: string, id: string) => ({
		id,
		get: jest.fn(async () => {
			const data = store(collectionName).get(id);

			return { exists: data !== undefined, data: () => data };
		}),
		set: jest.fn(async (data: Record<string, unknown>) => {
			(store(collectionName) as Map<string, unknown>).set(id, data);
		}),
		update: jest.fn(async () => undefined),
	});

	// Chainable query stub: every where/orderBy/limit returns itself, and get()
	// yields the option docs the revisit pass looks for (none, in these tests).
	const query: Record<string, unknown> = {};
	query.where = () => query;
	query.orderBy = () => query;
	query.limit = () => query;
	query.get = async () => ({ empty: true, docs: [], size: 0 });

	return {
		getFirestore: jest.fn(() => ({
			collection: (name: string) => ({
				doc: (id: string) => docRef(name, id),
				...query,
			}),
		})),
	};
});

// Near-identical vectors, so every cross-synth pair clears
// REJUDGE_MERGE_THRESHOLD and a merge is always PROPOSED. That leaves the
// mocked judge below ('different') as the thing that refuses it — which is what
// produces a refusal worth persisting.
const getBatchEmbeddings = jest.fn(async (ids: string[]) => {
	const map = new Map<string, number[]>();
	ids.forEach((id, i) => map.set(id, [1, i * 0.01, 0]));

	return map;
});
jest.mock('../../services/embedding-cache-service', () => ({
	embeddingCache: { getBatchEmbeddings: (ids: string[]) => getBatchEmbeddings(ids) },
}));

const consolidateThemes = jest.fn(async () => ({ merges: 0, themesBefore: 0, themesAfter: 0 }));
jest.mock('../pipeline/consolidateThemes', () => ({
	consolidateThemes: (...args: unknown[]) => consolidateThemes(...(args as [])),
}));

const splitOversizedThemes = jest.fn(async () => ({
	splits: 0,
	created: 0,
	themesBefore: 0,
}));
jest.mock('../pipeline/splitThemes', () => ({
	splitOversizedThemes: (...args: unknown[]) => splitOversizedThemes(...(args as [])),
}));

jest.mock('../../services/integration-ai-service', () => ({
	generateSynthesizedProposal: jest.fn(async () => ({ cannotSynthesize: true })),
}));
jest.mock('../../services/verdict-cache-service', () => ({
	judgeSemanticEquivalenceCachedDetailed: jest.fn(async () => ({
		results: [{ verdict: 'different' }],
		cacheMisses: 0,
	})),
}));
jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../liveSynth/auditLog', () => ({
	recordLiveSynthEvent: jest.fn(async () => undefined),
}));
jest.mock('../liveSynth/clusterRecompute', () => ({
	enqueueClusterRecompute: jest.fn(async () => undefined),
}));
jest.mock('../queue/enqueue', () => ({
	enqueueItem: jest.fn(async () => undefined),
	ensureQueueRun: jest.fn(async () => undefined),
}));
jest.mock('../pipeline/loadSynthesisSettings', () => ({
	loadSynthesisSettingsFromStatement: jest.fn(() => ({ synthLowerBound: 0.8 })),
}));

import { reJudgeProcessParent } from '../scheduled/fn_synthesisReJudge';
import {
	computeParentFingerprint,
	FORCE_FULL_SWEEP_MS,
	memberStateKey,
	resolveRejectedPairs,
} from '../scheduled/reJudgeSweepState';

const PARENT_ID = 'question-1';

function synth(id: string, members: string[], lastUpdate = 1_000): Statement {
	return {
		statementId: id,
		parentId: PARENT_ID,
		statement: `synth ${id}`,
		integratedOptions: members,
		lastUpdate,
	} as unknown as Statement;
}

function seedParent(lastChildUpdate: number, lastUpdate = 500): void {
	statementDocs.set(PARENT_ID, {
		statementId: PARENT_ID,
		statement: 'the question',
		lastChildUpdate,
		lastUpdate,
	} as unknown as Statement);
}

/** The synth members themselves — the transitivity gate reads their text. */
function seedMembers(): void {
	for (const id of ['o1', 'o2', 'o3', 'o4']) {
		statementDocs.set(id, {
			statementId: id,
			parentId: PARENT_ID,
			statement: `option ${id}`,
		} as unknown as Statement);
	}
}

beforeEach(() => {
	statementDocs.clear();
	sweepStateDocs.clear();
	seedMembers();
	jest.clearAllMocks();
});

describe('computeParentFingerprint', () => {
	it('is stable when nothing changed, whatever the synth order', () => {
		seedParent(9_000);
		const parent = statementDocs.get(PARENT_ID) ?? null;
		const a = synth('s1', ['o1', 'o2']);
		const b = synth('s2', ['o3']);

		expect(computeParentFingerprint([a, b], parent)).toBe(computeParentFingerprint([b, a], parent));
	});

	it('changes when a synth gains a member', () => {
		seedParent(9_000);
		const parent = statementDocs.get(PARENT_ID) ?? null;
		const before = computeParentFingerprint([synth('s1', ['o1'])], parent);
		const after = computeParentFingerprint([synth('s1', ['o1', 'o2'])], parent);

		expect(after).not.toBe(before);
	});

	it('changes when a child statement is written, even with synths untouched', () => {
		// This is the signal the revisit and theme passes depend on: a brand-new
		// option under the question never appears in the synth docs.
		const synths = [synth('s1', ['o1'])];
		seedParent(9_000);
		const before = computeParentFingerprint(synths, statementDocs.get(PARENT_ID) ?? null);
		seedParent(9_999);
		const after = computeParentFingerprint(synths, statementDocs.get(PARENT_ID) ?? null);

		expect(after).not.toBe(before);
	});
});

describe('resolveRejectedPairs', () => {
	it('honours a refusal while both synths keep the membership that was judged', () => {
		const fp = `${memberStateKey(['o1'])}|${memberStateKey(['o2'])}`;
		const usable = resolveRejectedPairs([{ p: 's1__s2', f: fp }], new Map([['s1__s2', fp]]));

		expect(usable.has('s1__s2')).toBe(true);
	});

	it('drops a refusal once either synth membership changed', () => {
		const judgedAt = `${memberStateKey(['o1'])}|${memberStateKey(['o2'])}`;
		const nowThat = `${memberStateKey(['o1', 'o9'])}|${memberStateKey(['o2'])}`;
		const usable = resolveRejectedPairs(
			[{ p: 's1__s2', f: judgedAt }],
			new Map([['s1__s2', nowThat]]),
		);

		expect(usable.has('s1__s2')).toBe(false);
	});
});

describe('reJudgeProcessParent sweep-state gate', () => {
	const synths = [synth('s1', ['o1', 'o2']), synth('s2', ['o3', 'o4'])];

	it('skips a parent whose fingerprint is unchanged, running no pass at all', async () => {
		seedParent(9_000);
		const first = await reJudgeProcessParent(PARENT_ID, synths, {
			useSweepState: true,
			now: 10_000,
		});
		expect(first.skipped).toBe(false);
		expect(consolidateThemes).toHaveBeenCalledTimes(1);

		jest.clearAllMocks();
		const second = await reJudgeProcessParent(PARENT_ID, synths, {
			useSweepState: true,
			now: 20_000,
		});

		expect(second.skipped).toBe(true);
		expect(second.merges).toBe(0);
		expect(consolidateThemes).not.toHaveBeenCalled();
		expect(splitOversizedThemes).not.toHaveBeenCalled();
		expect(getBatchEmbeddings).not.toHaveBeenCalled();
	});

	it('runs again once a child statement lands under the parent', async () => {
		seedParent(9_000);
		await reJudgeProcessParent(PARENT_ID, synths, { useSweepState: true, now: 10_000 });

		seedParent(11_000);
		jest.clearAllMocks();
		const result = await reJudgeProcessParent(PARENT_ID, synths, {
			useSweepState: true,
			now: 20_000,
		});

		expect(result.skipped).toBe(false);
		expect(consolidateThemes).toHaveBeenCalledTimes(1);
	});

	it('runs an unchanged parent anyway once FORCE_FULL_SWEEP_MS has passed', async () => {
		// The floor exists because both gates infer "nothing changed" from
		// timestamps maintained elsewhere. A missed bump must delay the sweep,
		// never cancel it.
		seedParent(9_000);
		await reJudgeProcessParent(PARENT_ID, synths, { useSweepState: true, now: 10_000 });

		jest.clearAllMocks();
		const result = await reJudgeProcessParent(PARENT_ID, synths, {
			useSweepState: true,
			now: 10_000 + FORCE_FULL_SWEEP_MS,
		});

		expect(result.skipped).toBe(false);
		expect(consolidateThemes).toHaveBeenCalledTimes(1);
	});

	it('never skips when the caller does not opt in, so the benchmark pump measures real passes', async () => {
		seedParent(9_000);
		await reJudgeProcessParent(PARENT_ID, synths, { useSweepState: true, now: 10_000 });

		jest.clearAllMocks();
		const result = await reJudgeProcessParent(PARENT_ID, synths);

		expect(result.skipped).toBe(false);
		expect(consolidateThemes).toHaveBeenCalledTimes(1);
	});

	it('persists pair refusals so a settled parent stops re-judging them', async () => {
		seedParent(9_000);
		await reJudgeProcessParent(PARENT_ID, synths, { useSweepState: true, now: 10_000 });

		const stored = sweepStateDocs.get(PARENT_ID) as
			| { rejectedPairs?: { p: string; f: string }[] }
			| undefined;

		expect(stored?.rejectedPairs?.length).toBeGreaterThan(0);
		expect(stored?.rejectedPairs?.[0].p).toBe('s1__s2');
	});
});
