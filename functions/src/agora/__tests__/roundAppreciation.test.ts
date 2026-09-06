import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AgoraStage, Evaluation } from '@freedi/shared-types';

/**
 * A tiny in-memory Firestore: enough of `collection().doc().get()` and
 * `runTransaction` for the ledger to be exercised end to end.
 */
const store = new Map<string, Record<string, unknown>>();
const updates: Array<{ path: string; data: unknown; fieldPath?: string }> = [];

function pathOf(collectionName: string, id: string): string {
	return `${collectionName}/${id}`;
}

const fakeDb = {
	collection: (name: string) => ({
		doc: (id: string) => ({
			get: async () => {
				const data = store.get(pathOf(name, id));

				return { exists: data !== undefined, data: () => data };
			},
			__path: pathOf(name, id),
		}),
	}),
	runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
		const tx = {
			get: async (ref: { __path: string }) => {
				const data = store.get(ref.__path);

				return { exists: data !== undefined, data: () => data };
			},
			update: (ref: { __path: string }, a: unknown, b?: unknown) => {
				const current = store.get(ref.__path) ?? {};
				if (typeof a === 'object' && a !== null && 'segments' in (a as object)) {
					const segments = (a as { segments: string[] }).segments;
					const [top, key] = segments;
					const map = { ...((current[top] as Record<string, unknown>) ?? {}) };
					map[key] = b;
					store.set(ref.__path, { ...current, [top]: map });
					updates.push({ path: ref.__path, data: b, fieldPath: segments.join('.') });
				} else {
					store.set(ref.__path, { ...current, ...(a as Record<string, unknown>) });
					updates.push({ path: ref.__path, data: a });
				}
			},
		};
		await fn(tx);
	},
};

jest.mock('../../db', () => ({ db: fakeDb }));
jest.mock('firebase-admin/firestore', () => ({
	FieldPath: class {
		segments: string[];
		constructor(...segments: string[]) {
			this.segments = segments;
		}
	},
}));
jest.mock('firebase-functions/v2/firestore', () => ({ onDocumentWritten: jest.fn() }));
jest.mock('../../engagement/credits/creditEngine', () => ({ awardCredit: jest.fn() }));
jest.mock('../stageAdvance', () => ({ advanceSession: jest.fn() }));

import { creditRoundAppreciation } from '../fn_onAgoraEvaluation';

const SESSION = 's1';
const AUTHOR = 'alice';
const RATER = 'bob';
const ANSWER = 's1--alice--story';

function evaluation(value: number, evaluatorId = RATER): Evaluation {
	return {
		evaluationId: `${evaluatorId}--${ANSWER}`,
		statementId: ANSWER,
		parentId: 'q-story',
		evaluatorId,
		evaluation: value,
		updatedAt: 1,
		agoraSessionId: SESSION,
	} as unknown as Evaluation;
}

function authorPoints(): { appreciation?: number; total: number } {
	return (store.get(`agoraParticipants/${SESSION}--${AUTHOR}`)?.points ?? { total: 0 }) as {
		appreciation?: number;
		total: number;
	};
}

describe('creditRoundAppreciation', () => {
	beforeEach(() => {
		store.clear();
		updates.length = 0;
		store.set(`statements/${ANSWER}`, {
			statementId: ANSWER,
			creatorId: AUTHOR,
			statement: 'once',
		});
		store.set(`agoraParticipants/${SESSION}--${AUTHOR}`, {
			userId: AUTHOR,
			points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 4 },
		});
	});

	it('pays the author +1 for a like, once, and files the evaluation in the ledger', async () => {
		const like = evaluation(1);
		await creditRoundAppreciation(SESSION, AgoraStage.story, like, like.evaluationId);

		expect(authorPoints()).toMatchObject({ appreciation: 1, total: 5 });
		const ledger = store.get(`agoraParticipants/${SESSION}--${AUTHOR}`)
			?.roundAppreciations as Record<string, boolean>;
		expect(ledger[like.evaluationId]).toBe(true);

		// A redelivered trigger, or a re-like after an un-like: the key is there
		await creditRoundAppreciation(SESSION, AgoraStage.story, like, like.evaluationId);
		expect(authorPoints()).toMatchObject({ appreciation: 1, total: 5 });
	});

	it('pays nothing below the floor: an un-like, a 0.25 on a need', async () => {
		const unlike = evaluation(0);
		await creditRoundAppreciation(SESSION, AgoraStage.story, unlike, unlike.evaluationId);
		const low = evaluation(0.25);
		await creditRoundAppreciation(SESSION, AgoraStage.myNeeds, low, low.evaluationId);

		expect(authorPoints()).toEqual({ valueAccuracy: 0, proposals: 0, helping: 0, total: 4 });
		expect(updates).toHaveLength(0);
	});

	it('pays at the unit floor and once more never', async () => {
		const half = evaluation(0.5);
		await creditRoundAppreciation(SESSION, AgoraStage.vision, half, half.evaluationId);
		expect(authorPoints()).toMatchObject({ appreciation: 1, total: 5 });

		const raised = evaluation(1);
		await creditRoundAppreciation(SESSION, AgoraStage.vision, raised, raised.evaluationId);
		expect(authorPoints()).toMatchObject({ appreciation: 1, total: 5 });
	});

	it('never pays an author for liking their own text, nor a hidden text', async () => {
		const self = evaluation(1, AUTHOR);
		await creditRoundAppreciation(SESSION, AgoraStage.story, self, self.evaluationId);
		expect(authorPoints().total).toBe(4);

		store.set(`statements/${ANSWER}`, {
			statementId: ANSWER,
			creatorId: AUTHOR,
			statement: '',
			hide: true,
			agoraModeration: { hidden: true },
		});
		const like = evaluation(1);
		await creditRoundAppreciation(SESSION, AgoraStage.story, like, like.evaluationId);
		expect(authorPoints().total).toBe(4);
	});
});
