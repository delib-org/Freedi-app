/**
 * Smoke test for the topic-cluster pipeline. Runs in --from-file (offline) mode
 * with mocked Anthropic and OpenAI. Asserts:
 * - Pipeline returns without throwing.
 * - Returned summary has the expected shape.
 * - >=70% of core items get assigned to a cluster.
 *
 * Two fixtures: civic Hebrew + short-answer English.
 */

import * as path from 'path';

// 0. Mock firebase-functions logger (jest.setup.ts mocks admin but not functions).
jest.mock('firebase-functions', () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

// 0a. Mock the condensation aggregation helpers so the writer's eval-rollup step
// gets canned data. fetchEvaluationsForIds is a spy so we can assert it was
// (or wasn't) called depending on dryRun.
jest.mock('../../../condensation/aggregation', () => ({
	fetchEvaluationsForIds: jest.fn(async (ids: string[]) =>
		// Return a couple of synthetic evaluations per requested id so the
		// aggregator produces non-zero numbers. Dedup is per evaluator so we use
		// distinct evaluatorIds to keep numberOfEvaluators predictable.
		ids.flatMap((id, i) => [
			{
				evaluationId: `${id}-eval-A`,
				statementId: id,
				parentId: 'parent',
				evaluatorId: `user-A-${i % 3}`, // mod-3 forces some dedup overlap
				updatedAt: Date.now(),
				evaluation: 0.6,
			},
			{
				evaluationId: `${id}-eval-B`,
				statementId: id,
				parentId: 'parent',
				evaluatorId: `user-B-${i % 3}`,
				updatedAt: Date.now(),
				evaluation: -0.2,
			},
		]),
	),
	computeClusterEvaluationFromRawEvals: jest.fn(
		(evals: Array<{ evaluatorId: string; evaluation: number }>) => {
			// Replicate just enough of the real aggregator for the assertions.
			const byUser = new Map<string, number[]>();
			for (const e of evals) {
				const list = byUser.get(e.evaluatorId) ?? [];
				list.push(e.evaluation);
				byUser.set(e.evaluatorId, list);
			}
			const numberOfEvaluators = byUser.size;
			let sumEvaluations = 0;
			let sumPro = 0;
			let sumCon = 0;
			let numberOfProEvaluators = 0;
			let numberOfConEvaluators = 0;
			byUser.forEach((vals) => {
				const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
				sumEvaluations += avg;
				if (avg > 0) {
					numberOfProEvaluators++;
					sumPro += avg;
				} else if (avg < 0) {
					numberOfConEvaluators++;
					sumCon += Math.abs(avg);
				}
			});
			const averageEvaluation = numberOfEvaluators > 0 ? sumEvaluations / numberOfEvaluators : 0;

			return {
				evaluation: {
					sumEvaluations,
					agreement: averageEvaluation,
					numberOfEvaluators,
					sumPro,
					sumCon,
					numberOfProEvaluators,
					numberOfConEvaluators,
					averageEvaluation,
					sumSquaredEvaluations: 0,
					standardDeviation: 0,
					agreementIndex: 0,
					likeMindedness: 0,
					confidenceIndex: 0,
					evaluationRandomNumber: 0,
					viewed: 0,
				},
				byUser,
				perUserAverages: new Map(),
			};
		},
	),
}));

// 0b. Extend the global firebase-admin/firestore mock with getAll() and per-doc
// where()/get() shapes the pipeline expects. The default mock lacks these.
jest.mock('firebase-admin/firestore', () => {
	const docs = new Map<string, unknown>();
	const noop = jest.fn(() => Promise.resolve());
	const docRef = (id: string) => ({
		id,
		get: () => Promise.resolve({ exists: docs.has(id), data: () => docs.get(id) }),
		set: jest.fn((data: unknown) => {
			docs.set(id, data);

			return Promise.resolve();
		}),
		update: noop,
		delete: noop,
	});
	const collection = (name: string) => ({
		doc: (id: string) => docRef(`${name}/${id}`),
		where: function () {
			return this;
		},
		limit: function () {
			return this;
		},
		get: () => Promise.resolve({ docs: [], empty: true, size: 0 }),
	});
	const fs = {
		collection,
		doc: (p: string) => docRef(p),
		batch: () => ({
			set: jest.fn(),
			update: jest.fn(),
			delete: jest.fn(),
			commit: () => Promise.resolve(),
		}),
		getAll: (..._refs: unknown[]) =>
			Promise.resolve(_refs.map(() => ({ exists: false, data: () => undefined }))),
	};

	return {
		getFirestore: () => fs,
		Timestamp: {
			now: () => ({ toMillis: () => Date.now() }),
			fromMillis: (ms: number) => ({ toMillis: () => ms }),
		},
		FieldValue: { serverTimestamp: () => 0, delete: () => null },
	};
});

// 1. Mock the LLM client — taxonomy / normalize / name. The mock inspects the
// prompt to decide what canned response to return.
jest.mock('../../../config/openai-chat', () => {
	const actual = jest.requireActual('../../../config/openai-chat');

	return {
		...actual,
		callLLM: jest.fn(async (opts: { system?: string; user: string }) => {
			const { system = '', user } = opts;
			if (system.includes('taxonomy') || system.includes('classifies')) {
				return JSON.stringify({
					language: user.includes('צפת') ? 'he' : 'en',
					categories: [
						{
							key: 'health_fitness',
							name: 'Health & Fitness',
							description: 'Exercise, nutrition, wellness',
						},
						{ key: 'learning', name: 'Learning', description: 'Education, skills, knowledge' },
						{
							key: 'relationships',
							name: 'Relationships',
							description: 'Family, friends, community',
						},
						{ key: 'finances', name: 'Finances', description: 'Saving, budgeting, investing' },
						{ key: 'transport', name: 'Transport', description: 'Public transit and mobility' },
						{ key: 'culture', name: 'Culture', description: 'Festivals, heritage, arts' },
						{ key: 'employment', name: 'Employment', description: 'Industry, jobs, hi-tech' },
						{
							key: 'tourism_nature',
							name: 'Tourism & Nature',
							description: 'Trails, parks, nature',
						},
					],
				});
			}
			if (
				system.includes('extract') ||
				system.includes('normalize') ||
				system.includes('TAXONOMY')
			) {
				// Per-batch normalize: extract response IDs and category from text similarity.
				const idMatches = [...user.matchAll(/Response \d+ \(id ([^)]+)\):\n([^\n]+)/g)];
				const responses = idMatches.map((m) => {
					const id = m[1];
					const text = m[2];

					return {
						id,
						actions: [
							{
								canonical_sentence: text.length > 100 ? text.substring(0, 100) : text,
								category_key: pickCategory(text),
							},
						],
					};
				});

				return JSON.stringify({ responses });
			}
			if (system.includes('label') || system.includes('theme')) {
				// Cluster naming.
				return 'Sample cluster label';
			}

			return '{}';
		}),
	};
});

function pickCategory(text: string): string {
	const t = text.toLowerCase();
	if (/exercise|gym|run|walk|yoga|fitness|sport/.test(t)) return 'health_fitness';
	if (/eat|food|meal|nutrition|sugar|vegetab|cook/.test(t)) return 'health_fitness';
	if (/read|learn|class|course|languag|book|skill/.test(t)) return 'learning';
	if (/family|friend|parent|host|reconnect|volunteer|relation|communit/.test(t))
		return 'relationships';
	if (/money|save|budget|debt|invest|spend/.test(t)) return 'finances';
	if (/תחבורה|אוטובוס|הסעה|חשמלי/.test(text)) return 'transport';
	if (/פסטיבל|תרבות|מורשת|מוזיאון|אומנות|קבל/.test(text)) return 'culture';
	if (/חינוך|בתי הספר|הכשרה|מצוינות/.test(text)) return 'education';
	if (/תעשיי|הייטק|תעסוקה|עצמאי|צעירים/.test(text)) return 'employment';
	if (/שביל|טבע|אקולוגי|תיירות|גליל/.test(text)) return 'tourism_nature';

	return 'other';
}

// 2. Mock OpenAI embedding service — return deterministic per-category vectors so
// DBSCAN sees clusters by category (with small jitter so points aren't identical).
jest.mock('../../../services/embedding-service', () => {
	const dim = 16;
	const categoryToBaseVector: Record<string, number[]> = {};
	function vectorFor(text: string, idx: number): number[] {
		const cat = (() => {
			const lc = text.toLowerCase();
			if (
				/exercise|gym|run|walk|yoga|fitness|sport|eat|food|meal|nutrition|sugar|vegetab|cook/.test(
					lc,
				)
			)
				return 'health';
			if (/read|learn|class|course|languag|book|skill/.test(lc)) return 'learning';
			if (/family|friend|parent|host|reconnect|volunteer|relation|communit/.test(lc))
				return 'relate';
			if (/money|save|budget|debt|invest|spend/.test(lc)) return 'finance';
			if (/תחבורה|אוטובוס|הסעה|חשמלי/.test(text)) return 'transport';
			if (/פסטיבל|תרבות|מורשת|מוזיאון|אומנות|קבל/.test(text)) return 'culture';
			if (/חינוך|בתי הספר|הכשרה|מצוינות/.test(text)) return 'education';
			if (/תעשיי|הייטק|תעסוקה|עצמאי|צעירים/.test(text)) return 'employment';
			if (/שביל|טבע|אקולוגי|תיירות|גליל/.test(text)) return 'tourism';

			return 'other';
		})();
		if (!categoryToBaseVector[cat]) {
			const seed = cat.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
			const base: number[] = [];
			for (let i = 0; i < dim; i++) {
				base.push(Math.sin(seed * (i + 1)));
			}
			let norm = 0;
			for (const x of base) norm += x * x;
			norm = Math.sqrt(norm);
			categoryToBaseVector[cat] = base.map((x) => x / norm);
		}
		const base = categoryToBaseVector[cat];
		const jitterSeed = idx + 1;
		// Small deterministic jitter so points aren't identical (DBSCAN handles this fine).
		const jittered = base.map((x, i) => x + Math.sin(jitterSeed * (i + 7)) * 0.001);
		let n = 0;
		for (const x of jittered) n += x * x;
		n = Math.sqrt(n);

		return jittered.map((x) => x / n);
	}

	return {
		embeddingService: {
			generateBatchEmbeddings: jest.fn(
				async (texts: string[], _ctx?: string, _batchSize?: number) =>
					texts.map((text, i) => ({
						embedding: vectorFor(text, i),
						model: 'mock',
						dimensions: dim,
					})),
			),
			generateEmbeddingWithRetry: jest.fn(async (text: string) => ({
				embedding: vectorFor(text, 0),
				model: 'mock',
				dimensions: dim,
			})),
		},
	};
});

import { runTopicClusterPipeline } from '..';
import {
	fetchEvaluationsForIds as mockedFetchEvals,
	computeClusterEvaluationFromRawEvals as mockedComputeEval,
} from '../../../condensation/aggregation';

describe('topic-cluster pipeline smoke', () => {
	const fixturesDir = path.join(__dirname, 'fixtures');

	beforeEach(() => {
		(mockedFetchEvals as jest.Mock).mockClear();
		(mockedComputeEval as jest.Mock).mockClear();
	});

	it('clusters the English short-answer fixture with ≥70% assignment', async () => {
		const summary = await runTopicClusterPipeline('fixture_en_parent', {
			fromFile: path.join(fixturesDir, 'short-answer-en.json'),
			dryRun: true,
		});

		expect(summary.parentId).toBe('fixture_en_parent');
		expect(summary.taxonomy.length).toBeGreaterThanOrEqual(8);
		expect(summary.totals.responsesLoaded).toBe(24);
		expect(summary.totals.actionsExtracted).toBeGreaterThan(0);

		const totalCore = summary.totals.actionsExtracted;
		const assigned = summary.totals.assignedToCluster;
		expect(assigned / totalCore).toBeGreaterThanOrEqual(0.7);
	});

	it('clusters the Hebrew civic fixture with ≥70% assignment', async () => {
		const summary = await runTopicClusterPipeline('fixture_he_parent', {
			fromFile: path.join(fixturesDir, 'civic-hebrew.json'),
			dryRun: true,
		});

		expect(summary.parentId).toBe('fixture_he_parent');
		expect(summary.taxonomy.length).toBeGreaterThanOrEqual(8);
		expect(summary.totals.responsesLoaded).toBe(24);

		const totalCore = summary.totals.actionsExtracted;
		const assigned = summary.totals.assignedToCluster;
		expect(assigned / totalCore).toBeGreaterThanOrEqual(0.7);
	});

	it('skips evaluation aggregation on dry-run', async () => {
		await runTopicClusterPipeline('fixture_en_parent', {
			fromFile: path.join(fixturesDir, 'short-answer-en.json'),
			dryRun: true,
		});
		expect(mockedFetchEvals).not.toHaveBeenCalled();
		expect(mockedComputeEval).not.toHaveBeenCalled();
	});

	it('aggregates member evaluations onto each cluster on a live write', async () => {
		const summary = await runTopicClusterPipeline('fixture_en_parent', {
			fromFile: path.join(fixturesDir, 'short-answer-en.json'),
			dryRun: false,
		});
		// fetchEvaluationsForIds runs once per non-empty cluster in parallel.
		expect(mockedFetchEvals).toHaveBeenCalled();
		expect(mockedComputeEval).toHaveBeenCalled();
		expect(summary.totals.clustersCreated).toBeGreaterThan(0);
		// Every fetch should have been called with at least one member id.
		for (const call of (mockedFetchEvals as jest.Mock).mock.calls) {
			const memberIds = call[0] as string[];
			expect(memberIds.length).toBeGreaterThan(0);
		}
	});
});
