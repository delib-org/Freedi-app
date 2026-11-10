import { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { Role, Statement, StatementType } from '@freedi/shared-types';
import statements from '@/redux/statements/statementsSlice';
import { evaluationsSlice } from '@/redux/evaluations/evaluationsSlice';
import { votesSlice } from '@/redux/vote/votesSlice';
import { creatorSlice } from '@/redux/creator/creatorSlice';
import { useAnswerScoreGate, useQuestionScoreAccess } from '../useAnswerScoreGate';

const VIEWER = 'viewer';

function question(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'q1',
		statementType: StatementType.question,
		parentId: 'top',
		topParentId: 'q1',
		creatorId: 'host',
		statementSettings: { showEvaluation: true, evaluationType: 'range' },
		...overrides,
	} as Statement;
}

function answer(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'a1',
		statement: 'An answer',
		statementType: StatementType.option,
		parentId: 'q1',
		topParentId: 'q1',
		creatorId: 'someone-else',
		createdAt: 1,
		...overrides,
	} as Statement;
}

interface Seed {
	statementRows?: Statement[];
	evaluations?: Array<{ statementId: string; parentId: string; evaluation: number }>;
	votedOptionId?: string;
	role?: Role;
}

function wrapperFor({ statementRows = [], evaluations = [], votedOptionId, role }: Seed) {
	const store = configureStore({
		reducer: {
			statements,
			evaluations: evaluationsSlice.reducer,
			votes: votesSlice.reducer,
			creator: creatorSlice.reducer,
		},
		preloadedState: {
			statements: {
				...statements(undefined, { type: 'init' }),
				statements: statementRows,
				statementSubscription: role
					? [{ statementId: 'q1', userId: VIEWER, role, statement: statementRows[0] }]
					: [],
			},
			evaluations: {
				userEvaluations: evaluations.map((row) => ({ ...row, evaluatorId: VIEWER })),
			},
			votes: {
				votes: votedOptionId
					? [{ statementId: votedOptionId, userId: VIEWER, parentId: 'q1', voteId: 'v1' }]
					: [],
			},
			creator: { creator: { uid: VIEWER, displayName: 'V' } },
		} as never,
	});

	return function Wrapper({ children }: { children: ReactNode }) {
		return <Provider store={store}>{children}</Provider>;
	};
}

describe('useAnswerScoreGate', () => {
	it('fails closed while the question has not loaded', () => {
		const { result } = renderHook(() => useAnswerScoreGate(answer()), {
			wrapper: wrapperFor({ evaluations: [{ statementId: 'a1', parentId: 'q1', evaluation: 1 }] }),
		});

		expect(result.current.canSee).toBe(false);
	});

	it('holds the score back and promises a reveal before rating', () => {
		const q = question();
		const { result } = renderHook(() => useAnswerScoreGate(answer(), q), {
			wrapper: wrapperFor({ statementRows: [q] }),
		});

		expect(result.current).toEqual({ canSee: false, showRevealHint: true });
	});

	it('shows the score after rating this answer', () => {
		const q = question();
		const { result } = renderHook(() => useAnswerScoreGate(answer(), q), {
			wrapper: wrapperFor({
				statementRows: [q],
				evaluations: [{ statementId: 'a1', parentId: 'q1', evaluation: -1 }],
			}),
		});

		expect(result.current.canSee).toBe(true);
	});

	it('uses the rating override for a card ahead of the store', () => {
		const q = question();
		const { result } = renderHook(() => useAnswerScoreGate(answer(), q, { hasRated: true }), {
			wrapper: wrapperFor({ statementRows: [q] }),
		});

		expect(result.current.canSee).toBe(true);
	});

	it('hides an author their own score while results are off', () => {
		const q = question({
			statementSettings: { showEvaluation: false, evaluationType: 'range' },
		} as Partial<Statement>);
		const { result } = renderHook(() => useAnswerScoreGate(answer({ creatorId: VIEWER }), q), {
			wrapper: wrapperFor({ statementRows: [q] }),
		});

		expect(result.current.canSee).toBe(false);
	});

	it('always shows authors their own score while results are on', () => {
		const q = question();
		const { result } = renderHook(() => useAnswerScoreGate(answer({ creatorId: VIEWER }), q), {
			wrapper: wrapperFor({ statementRows: [q] }),
		});

		expect(result.current.canSee).toBe(true);
	});

	it("takes the caller's host fact while results are on, and not while they are off", () => {
		const on = question();
		const off = question({
			statementSettings: { showEvaluation: false, evaluationType: 'range' },
		} as Partial<Statement>);
		const render = (q: Statement) =>
			renderHook(() => useAnswerScoreGate(answer(), q, { isHost: true }), {
				wrapper: wrapperFor({ statementRows: [q] }),
			}).result.current.canSee;

		expect(render(on)).toBe(true);
		expect(render(off)).toBe(false);
	});

	it('shows a host the score once a results-off question is settled', () => {
		const q = question({
			statementSettings: { showEvaluation: false, evaluationType: 'range' },
			questionSettings: { deadline: 1 },
		} as Partial<Statement>);
		const { result } = renderHook(() => useAnswerScoreGate(answer(), q), {
			wrapper: wrapperFor({ statementRows: [q], role: Role.admin }),
		});

		expect(result.current.canSee).toBe(true);
	});

	it('hides the score from a host while results are off', () => {
		const q = question({
			statementSettings: { showEvaluation: false, evaluationType: 'range' },
		} as Partial<Statement>);
		const { result } = renderHook(() => useAnswerScoreGate(answer(), q), {
			wrapper: wrapperFor({ statementRows: [q], role: Role.admin }),
		});

		expect(result.current).toEqual({ canSee: false, showRevealHint: false });
	});

	it('keeps showing a host the score while results are on', () => {
		const q = question();
		const { result } = renderHook(() => useAnswerScoreGate(answer(), q), {
			wrapper: wrapperFor({ statementRows: [q], role: Role.admin }),
		});

		expect(result.current.canSee).toBe(true);
	});

	it('opens single-like counts after a like anywhere in the question', () => {
		const q = question({
			statementSettings: { showEvaluation: true, evaluationType: 'single-like' },
		} as Partial<Statement>);
		const { result } = renderHook(() => useAnswerScoreGate(answer(), q), {
			wrapper: wrapperFor({
				statementRows: [q],
				evaluations: [{ statementId: 'other', parentId: 'q1', evaluation: 1 }],
			}),
		});

		expect(result.current.canSee).toBe(true);
	});
});

describe('useQuestionScoreAccess', () => {
	const options = [answer(), answer({ statementId: 'a2' })];

	it('stays closed while the answers have not arrived, with live results on', () => {
		const q = question({ numberOfOptions: 4 } as Partial<Statement>);
		const { result } = renderHook(() => useQuestionScoreAccess(q), {
			wrapper: wrapperFor({ statementRows: [q] }),
		});

		expect(result.current.canSee).toBe(false);
		expect(result.current.facts.ratingClosed).toBe(false);
	});

	it('stays closed on an empty store when the question has no answer counter', () => {
		const q = question();
		const { result } = renderHook(() => useQuestionScoreAccess(q), {
			wrapper: wrapperFor({ statementRows: [q] }),
		});

		expect(result.current.canSee).toBe(false);
	});

	it('does not lock anyone out once it is known there is nothing to rate', () => {
		const q = question({ numberOfOptions: 0 } as Partial<Statement>);
		const { result } = renderHook(() => useQuestionScoreAccess(q), {
			wrapper: wrapperFor({ statementRows: [q] }),
		});

		expect(result.current.canSee).toBe(true);
	});

	it('stays closed for question-wide results before the viewer rated anything', () => {
		const q = question();
		const { result } = renderHook(() => useQuestionScoreAccess(q), {
			wrapper: wrapperFor({ statementRows: [q, ...options] }),
		});

		expect(result.current.canSee).toBe(false);
	});

	it('opens once the viewer rated one answer', () => {
		const q = question();
		const { result } = renderHook(() => useQuestionScoreAccess(q), {
			wrapper: wrapperFor({
				statementRows: [q, ...options],
				evaluations: [{ statementId: 'a1', parentId: 'q1', evaluation: 1 }],
			}),
		});

		expect(result.current.canSee).toBe(true);
	});

	it('counts a vote', () => {
		const q = question();
		const { result } = renderHook(() => useQuestionScoreAccess(q), {
			wrapper: wrapperFor({ statementRows: [q, ...options], votedOptionId: 'a1' }),
		});

		expect(result.current.canSee).toBe(true);
	});

	it('does not count a withdrawn vote', () => {
		const q = question();
		const { result } = renderHook(() => useQuestionScoreAccess(q), {
			wrapper: wrapperFor({ statementRows: [q, ...options], votedOptionId: 'none' }),
		});

		expect(result.current.canSee).toBe(false);
	});

	it('does not count a rating of the viewer’s own answer', () => {
		const q = question();
		const own = answer({ statementId: 'mine', creatorId: VIEWER });
		const { result } = renderHook(() => useQuestionScoreAccess(q), {
			wrapper: wrapperFor({
				statementRows: [q, own, ...options],
				evaluations: [{ statementId: 'mine', parentId: 'q1', evaluation: 1 }],
			}),
		});

		expect(result.current.canSee).toBe(false);
	});
});
