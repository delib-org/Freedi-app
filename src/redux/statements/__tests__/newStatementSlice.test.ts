/**
 * Tests for newStatementSlice Redux store
 *
 * Tests all reducers and selectors for statement creation modal.
 */

// Mock @freedi/shared-types before import
jest.mock('@freedi/shared-types', () => ({
	StatementType: {
		statement: 'statement',
		option: 'option',
		question: 'question',
		document: 'document',
		group: 'group',
		comment: 'comment',
	},
	QuestionType: {
		simple: 'simple',
		multipleChoice: 'multipleChoice',
		massConsensus: 'massConsensus',
	},
}));

jest.mock('@/models/questionTypeDefaults', () => ({
	getDefaultQuestionType: jest.fn(() => 'simple'),
}));

enum StatementType {
	statement = 'statement',
	option = 'option',
	question = 'question',
}

enum QuestionType {
	simple = 'simple',
	multipleChoice = 'multipleChoice',
	massConsensus = 'massConsensus',
}

import {
	newStatementSlice,
	setNewStatementModal,
	setParentStatement,
	setNewStatementType,
	setNewQuestionType,
	clearNewStatement,
	setLoading,
	setError,
	setShowNewStatementModal,
	openAddStatement,
	closeAddStatement,
	selectAddStatementIntent,
	selectAddStatementOrigin,
	selectAddStatementCommit,
	selectParentStatementForNewStatement,
	selectNewStatementLoading,
	selectNewStatementError,
	selectNewStatementShowModal,
	selectNewStatement,
	NewStatementState,
} from '../newStatementSlice';

const mockStatement = {
	statementId: 'stmt-123',
	parentId: 'top',
	topParentId: 'stmt-123',
	statement: 'Test statement',
	statementType: StatementType.question,
	creator: { uid: 'user-1', displayName: 'User', email: 'user@test.com' },
	creatorId: 'user-1',
	createdAt: 1000000,
	lastUpdate: 1000000,
	consensus: 0,
	parents: [],
	results: [],
};

const getInitialState = (): NewStatementState => ({
	parentStatement: null,
	newStatement: null,
	isLoading: false,
	error: null,
	showModal: false,
	intent: null,
	origin: null,
	commit: 'db',
});

describe('newStatementSlice', () => {
	describe('reducers', () => {
		describe('setNewStatementModal', () => {
			it('should set all modal properties at once', () => {
				const modalPayload = {
					parentStatement: mockStatement,
					newStatement: { statementType: StatementType.option },
					isLoading: true,
					error: 'Some error',
					showModal: true,
				};

				const result = newStatementSlice.reducer(
					getInitialState(),
					setNewStatementModal(modalPayload as never),
				);

				expect(result.parentStatement).toEqual(mockStatement);
				expect(result.newStatement).toEqual({ statementType: StatementType.option });
				expect(result.isLoading).toBe(true);
				expect(result.error).toBe('Some error');
				expect(result.showModal).toBe(true);
			});

			it('should use defaults when optional fields are missing', () => {
				const modalPayload = {
					parentStatement: null,
					newStatement: null,
					isLoading: false,
					error: null,
					showModal: false,
				};

				const result = newStatementSlice.reducer(
					getInitialState(),
					setNewStatementModal(modalPayload as never),
				);

				expect(result.parentStatement).toBeNull();
				expect(result.newStatement).toBeNull();
				expect(result.isLoading).toBe(false);
				expect(result.error).toBeNull();
				expect(result.showModal).toBe(false);
			});
		});

		describe('setParentStatement', () => {
			it('should set parent statement to a statement', () => {
				const result = newStatementSlice.reducer(
					getInitialState(),
					setParentStatement(mockStatement as never),
				);

				expect(result.parentStatement).toEqual(mockStatement);
			});

			it('should set parent statement to "top"', () => {
				const result = newStatementSlice.reducer(getInitialState(), setParentStatement('top'));

				expect(result.parentStatement).toBe('top');
			});

			it('should set parent statement to null (clearing)', () => {
				const stateWithParent = { ...getInitialState(), parentStatement: mockStatement };

				const result = newStatementSlice.reducer(
					stateWithParent as never,
					setParentStatement(null),
				);

				expect(result.parentStatement).toBeNull();
			});
		});

		describe('setNewStatementType', () => {
			it('should set the statement type', () => {
				const result = newStatementSlice.reducer(
					getInitialState(),
					setNewStatementType(StatementType.option as never),
				);

				expect((result.newStatement as Record<string, unknown>)?.statementType).toBe(
					StatementType.option,
				);
			});

			it('should preserve existing newStatement fields when setting type', () => {
				const stateWithNewStatement = {
					...getInitialState(),
					newStatement: { statement: 'Partial text', statementType: StatementType.statement },
				};

				const result = newStatementSlice.reducer(
					stateWithNewStatement as never,
					setNewStatementType(StatementType.option as never),
				);

				expect((result.newStatement as Record<string, unknown>)?.statement).toBe('Partial text');
				expect((result.newStatement as Record<string, unknown>)?.statementType).toBe(
					StatementType.option,
				);
			});

			it('should update statement type when changed', () => {
				const initialWithType = {
					...getInitialState(),
					newStatement: { statementType: StatementType.statement },
				};

				const result = newStatementSlice.reducer(
					initialWithType as never,
					setNewStatementType(StatementType.question as never),
				);

				expect((result.newStatement as Record<string, unknown>)?.statementType).toBe(
					StatementType.question,
				);
			});
		});

		describe('setNewQuestionType', () => {
			it('should set question type', () => {
				const result = newStatementSlice.reducer(
					getInitialState(),
					setNewQuestionType(QuestionType.multipleChoice as never),
				);

				const settings = (result.newStatement as Record<string, unknown>)
					?.questionSettings as Record<string, unknown>;
				expect(settings?.questionType).toBe(QuestionType.multipleChoice);
			});

			it('should use default question type when null is passed', () => {
				const result = newStatementSlice.reducer(getInitialState(), setNewQuestionType(null));

				const settings = (result.newStatement as Record<string, unknown>)
					?.questionSettings as Record<string, unknown>;
				// getDefaultQuestionType is mocked to return 'simple'
				expect(settings?.questionType).toBe('simple');
			});

			it('should preserve existing questionSettings when adding type', () => {
				const stateWithSettings = {
					...getInitialState(),
					newStatement: {
						questionSettings: { someOtherSetting: true },
					},
				};

				const result = newStatementSlice.reducer(
					stateWithSettings as never,
					setNewQuestionType(QuestionType.simple as never),
				);

				const settings = (result.newStatement as Record<string, unknown>)
					?.questionSettings as Record<string, unknown>;
				expect(settings?.someOtherSetting).toBe(true);
				expect(settings?.questionType).toBe(QuestionType.simple);
			});
		});

		describe('clearNewStatement', () => {
			it('should reset all state to initial values', () => {
				const populatedState = {
					parentStatement: mockStatement,
					newStatement: { statementType: StatementType.option },
					isLoading: true,
					error: 'An error',
					showModal: true,
				};

				const result = newStatementSlice.reducer(populatedState as never, clearNewStatement());

				expect(result.parentStatement).toBeNull();
				expect(result.newStatement).toBeNull();
				expect(result.isLoading).toBe(false);
				expect(result.error).toBeNull();
				expect(result.showModal).toBe(false);
			});
		});

		describe('setLoading', () => {
			it('should set isLoading to true', () => {
				const result = newStatementSlice.reducer(getInitialState(), setLoading(true));
				expect(result.isLoading).toBe(true);
			});

			it('should set isLoading to false', () => {
				const stateWithLoading = { ...getInitialState(), isLoading: true };
				const result = newStatementSlice.reducer(stateWithLoading, setLoading(false));
				expect(result.isLoading).toBe(false);
			});
		});

		describe('setError', () => {
			it('should set an error message', () => {
				const result = newStatementSlice.reducer(getInitialState(), setError('Network error'));
				expect(result.error).toBe('Network error');
			});

			it('should clear the error when null is passed', () => {
				const stateWithError = { ...getInitialState(), error: 'Some error' };
				const result = newStatementSlice.reducer(stateWithError, setError(null));
				expect(result.error).toBeNull();
			});
		});

		describe('setShowNewStatementModal', () => {
			it('should show the modal', () => {
				const result = newStatementSlice.reducer(getInitialState(), setShowNewStatementModal(true));
				expect(result.showModal).toBe(true);
			});

			it('should hide the modal', () => {
				const stateWithModal = { ...getInitialState(), showModal: true };
				const result = newStatementSlice.reducer(stateWithModal, setShowNewStatementModal(false));
				expect(result.showModal).toBe(false);
			});
		});
	});

	describe('openAddStatement / closeAddStatement', () => {
		it('opens the flow with intent, origin and the child type derived from the intent', () => {
			const state = newStatementSlice.reducer(
				getInitialState(),
				openAddStatement({
					parentStatement: mockStatement as never,
					intent: 'answer',
					origin: 'bar',
				}),
			);
			expect(state).toMatchObject({
				showModal: true,
				intent: 'answer',
				origin: 'bar',
				commit: 'db',
				newStatement: { statementType: StatementType.option },
			});
			expect(state.parentStatement).toEqual(mockStatement);
		});

		it('carries the question type and a storeTemp commit', () => {
			const state = newStatementSlice.reducer(
				getInitialState(),
				openAddStatement({
					parentStatement: 'top',
					intent: 'question',
					origin: 'home',
					commit: 'storeTemp',
					questionType: QuestionType.simple as never,
				}),
			);
			expect(state.commit).toBe('storeTemp');
			expect(state.newStatement).toEqual({
				statementType: StatementType.question,
				questionSettings: { questionType: QuestionType.simple },
			});
		});

		it('closeAddStatement resets everything including intent and origin', () => {
			const opened = newStatementSlice.reducer(
				getInitialState(),
				openAddStatement({ parentStatement: 'top', intent: 'group', origin: 'fab' }),
			);
			expect(newStatementSlice.reducer(opened, closeAddStatement())).toEqual(getInitialState());
		});

		it('legacy setNewStatementModal derives intent from the statement type and origin legacy', () => {
			const state = newStatementSlice.reducer(
				getInitialState(),
				setNewStatementModal({
					parentStatement: mockStatement as never,
					newStatement: { statementType: StatementType.question },
					isLoading: false,
					error: null,
					showModal: true,
				}),
			);
			expect(state.intent).toBe('question');
			expect(state.origin).toBe('legacy');
		});

		it('selectors expose intent, origin and commit', () => {
			const state = {
				newStatement: {
					...getInitialState(),
					intent: 'answer',
					origin: 'url',
					commit: 'storeTemp',
				},
			} as { newStatement: NewStatementState };
			expect(selectAddStatementIntent(state)).toBe('answer');
			expect(selectAddStatementOrigin(state)).toBe('url');
			expect(selectAddStatementCommit(state)).toBe('storeTemp');
		});
	});

	describe('selectors', () => {
		const populatedState = {
			newStatement: {
				parentStatement: mockStatement,
				newStatement: { statementType: StatementType.option },
				isLoading: true,
				error: 'Test error',
				showModal: true,
			},
		};

		it('selectParentStatementForNewStatement should return parentStatement', () => {
			const result = selectParentStatementForNewStatement(populatedState as never);
			expect(result).toEqual(mockStatement);
		});

		it('selectNewStatementLoading should return isLoading', () => {
			const result = selectNewStatementLoading(populatedState as never);
			expect(result).toBe(true);
		});

		it('selectNewStatementError should return error', () => {
			const result = selectNewStatementError(populatedState as never);
			expect(result).toBe('Test error');
		});

		it('selectNewStatementShowModal should return showModal', () => {
			const result = selectNewStatementShowModal(populatedState as never);
			expect(result).toBe(true);
		});

		it('selectNewStatement should return newStatement', () => {
			const result = selectNewStatement(populatedState as never);
			expect(result).toEqual({ statementType: StatementType.option });
		});

		it('selectors should return null/false for empty initial state', () => {
			const emptyState = { newStatement: getInitialState() };

			expect(selectParentStatementForNewStatement(emptyState as never)).toBeNull();
			expect(selectNewStatementLoading(emptyState as never)).toBe(false);
			expect(selectNewStatementError(emptyState as never)).toBeNull();
			expect(selectNewStatementShowModal(emptyState as never)).toBe(false);
			expect(selectNewStatement(emptyState as never)).toBeNull();
		});
	});

	describe('edge cases', () => {
		it('should handle rapid state changes', () => {
			let state = getInitialState();

			state = newStatementSlice.reducer(state, setLoading(true));
			state = newStatementSlice.reducer(state, setError('Error'));
			state = newStatementSlice.reducer(state, setShowNewStatementModal(true));
			state = newStatementSlice.reducer(state, setParentStatement(mockStatement as never));
			state = newStatementSlice.reducer(state, setNewStatementType(StatementType.option as never));
			state = newStatementSlice.reducer(state, clearNewStatement());

			// After clear, all should be reset
			expect(state.parentStatement).toBeNull();
			expect(state.newStatement).toBeNull();
			expect(state.isLoading).toBe(false);
			expect(state.error).toBeNull();
			expect(state.showModal).toBe(false);
		});
	});
});
