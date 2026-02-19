import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import {
	Statement,
	StatementSubscription,
	SelectionFunction,
	StatementType,
	updateArray,
	ResultsSettings,
} from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';
import {
	createStatementByIdSelector,
	createStatementsByParentSelector,
	createStatementsByParentAndTypeSelector,
	createFilteredStatementsSelector,
	sortByCreatedAt,
} from '../utils/selectorFactories';

export enum StatementScreen {
	chat = 'chat',
	options = 'options',
}

// Define a type for the slice state
interface StatementsState {
	statements: Statement[];
	statementSubscription: StatementSubscription[];
	statementSubscriptionLastUpdate: number;
	statementMembership: StatementSubscription[];
	screen: StatementScreen;
}

interface StatementOrder {
	statementId: 'string';
	order: number;
}

interface UpdateResultsSettings {
	statementId: string;
	resultsSettings: ResultsSettings;
}

// Define the initial state using that type
const initialState: StatementsState = {
	statements: [],
	statementSubscription: [],
	statementSubscriptionLastUpdate: 0,
	statementMembership: [],
	screen: StatementScreen.chat,
};

export const statementsSlice = createSlice({
	name: 'statements',
	initialState,
	reducers: {
		setStatement: (state, action: PayloadAction<Statement>) => {
			try {
				const newStatement = { ...action.payload };

				//for legacy statements - can be deleted after all statements are updated or at least after 1 feb 24.
				if (!Array.isArray(newStatement.results)) newStatement.results = [];

				newStatement.order = 0;

				// updateArray from delib-npm handles deduplication efficiently
				state.statements = updateArray(state.statements, newStatement, 'statementId');

				//update last update if bigger than current
				if (newStatement.lastUpdate > state.statementSubscriptionLastUpdate) {
					state.statementSubscriptionLastUpdate = newStatement.lastUpdate;
				}
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.setStatement',
					statementId: action.payload.statementId,
				});
			}
		},
		setMassConsensusStatements: (
			state,
			action: PayloadAction<{
				statements: Statement[];
				selectionFunction: SelectionFunction;
			}>,
		) => {
			const statements = action.payload.statements.map((st: Statement) => ({
				...st,
				evaluation: {
					sumEvaluations: st.evaluation?.sumEvaluations ?? 0,
					agreement: st.evaluation?.agreement ?? 0,
					numberOfEvaluators: st.evaluation?.numberOfEvaluators ?? 0,
					sumPro: st.evaluation?.sumPro ?? 0,
					sumCon: st.evaluation?.sumCon ?? 0,
					sumSquaredEvaluations: st.evaluation?.sumSquaredEvaluations ?? 0,
					averageEvaluation: st.evaluation?.averageEvaluation ?? 0,
					viewed: st.evaluation?.viewed ?? 0,
					evaluationRandomNumber: st.evaluation?.evaluationRandomNumber,
					selectionFunction: action.payload.selectionFunction,
				},
			}));

			const previousSelectedStatements: Statement[] = state.statements
				.filter((st) => st.evaluation?.selectionFunction === action.payload.selectionFunction)
				.map((st) => ({
					...st,
					evaluation: {
						...st.evaluation,
						selectionFunction: undefined,
					},
				}));

			previousSelectedStatements.forEach((st) => {
				state.statements = updateArray(state.statements, st, 'statementId');
			});
			statements.forEach((st) => {
				state.statements = updateArray(state.statements, st, 'statementId');
			});
		},
		setStatements: (state, action: PayloadAction<Statement[]>) => {
			try {
				const statements = action.payload;

				statements.forEach((statement) => {
					state.statements = updateArray(state.statements, statement, 'statementId');
				});
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.setStatements',
					metadata: { count: action.payload.length },
				});
			}
		},
		deleteStatement: (state, action: PayloadAction<string>) => {
			try {
				const statementId = action.payload;

				state.statements = state.statements.filter(
					(statement) => statement.statementId !== statementId,
				);
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.deleteStatement',
					statementId: action.payload,
				});
			}
		},
		setStatementSubscription: (state, action: PayloadAction<StatementSubscription>) => {
			try {
				const newStatementSubscription = action.payload;

				// updateArray from delib-npm handles deduplication efficiently
				state.statementSubscription = updateArray(
					state.statementSubscription,
					newStatementSubscription,
					'statementId',
				);

				//update last update if bigger than current
				if (newStatementSubscription.lastUpdate > state.statementSubscriptionLastUpdate) {
					state.statementSubscriptionLastUpdate = newStatementSubscription.lastUpdate;
				}
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.setStatementSubscription',
					statementId: action.payload.statementId,
				});
			}
		},
		setStatementsSubscription: (state, action: PayloadAction<StatementSubscription[]>) => {
			try {
				const newStatements = action.payload;

				newStatements.forEach((statement) => {
					state.statementSubscription = updateArray(
						state.statementSubscription,
						statement,
						'statementsSubscribeId',
					);
				});
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.setStatementsSubscription',
					metadata: { count: action.payload.length },
				});
			}
		},
		deleteSubscribedStatement: (state, action: PayloadAction<string>) => {
			try {
				const statementId = action.payload;

				state.statementSubscription = state.statementSubscription.filter(
					(statement) => statement.statementId !== statementId,
				);
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.deleteSubscribedStatement',
					statementId: action.payload,
				});
			}
		},
		setStatementOrder: (state, action: PayloadAction<StatementOrder>) => {
			try {
				const { statementId, order } = action.payload;
				const statement = state.statements.find(
					(statement) => statement.statementId === statementId,
				);
				if (statement) statement.order = order;
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.setStatementOrder',
					statementId: action.payload.statementId,
					metadata: { order: action.payload.order },
				});
			}
		},
		setStatementElementHight: (
			state,
			action: PayloadAction<{
				statementId: string;
				height: number | undefined;
			}>,
		) => {
			try {
				const { statementId, height } = action.payload;
				const statement = state.statements.find(
					(statement) => statement.statementId === statementId,
				);
				if (statement) statement.elementHight = height;
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.setStatementElementHight',
					statementId: action.payload.statementId,
				});
			}
		},
		updateStatementTop: (state, action: PayloadAction<{ statementId: string; top: number }[]>) => {
			try {
				const updates = action.payload;
				updates.forEach((update) => {
					try {
						const statement = state.statements.find(
							(statement) => statement.statementId === update.statementId,
						);
						if (statement) {
							statement.top = update.top;
						} else {
							logError(new Error('Statement not found'), {
								operation: 'statementsSlice.updateStatementTop',
								statementId: update.statementId,
							});
						}
					} catch (error) {
						logError(error, {
							operation: 'statementsSlice.updateStatementTop.forEach',
							statementId: update.statementId,
						});
					}
				});
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.updateStatementTop',
					metadata: { updateCount: action.payload.length },
				});
			}
		},
		setScreen: (state, action: PayloadAction<StatementScreen>) => {
			try {
				state.screen = action.payload;
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.setScreen',
					metadata: { screen: action.payload },
				});
			}
		},

		setMembership: (state, action: PayloadAction<StatementSubscription>) => {
			try {
				const newMembership = action.payload;

				state.statementMembership = updateArray(
					state.statementMembership,
					newMembership,
					'statementsSubscribeId',
				);
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.setMembership',
					statementId: action.payload.statementId,
				});
			}
		},
		removeMembership: (state, action: PayloadAction<string>) => {
			try {
				const statementsSubscribeId = action.payload;
				state.statementMembership = state.statementMembership.filter(
					(statement) => statement.statementsSubscribeId !== statementsSubscribeId,
				);
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.removeMembership',
					metadata: { subscribeId: action.payload },
				});
			}
		},
		resetStatements: (state) => {
			state.statements = [];
			state.statementSubscription = [];
			state.statementSubscriptionLastUpdate = 0;
			state.statementMembership = [];
			state.screen = StatementScreen.chat;
		},
		setCurrentMultiStepOptions: (state, action: PayloadAction<Statement[]>) => {
			try {
				const previousInMultiStageOptions = state.statements.filter(
					(statement) => statement.isInMultiStage,
				);
				previousInMultiStageOptions.forEach((statement) => {
					statement.isInMultiStage = false;
				});

				const newStatements = action.payload;
				newStatements.forEach((statement) => {
					statement.isInMultiStage = true;
					state.statements = updateArray(state.statements, statement, 'statementId');
				});
			} catch (error) {
				logError(error, {
					operation: 'statementsSlice.setCurrentMultiStepOptions',
					metadata: { count: action.payload.length },
				});
			}
		},
		updateStoreResultsSettings: (state, action: PayloadAction<UpdateResultsSettings>) => {
			const { statementId, resultsSettings } = action.payload;
			const statement = state.statements.find((statement) => statement.statementId === statementId);
			if (statement) {
				statement.resultsSettings = resultsSettings;
			}
		},
	},
});

export const {
	setStatement,
	setStatements,
	setStatementSubscription,
	setStatementsSubscription,
	deleteStatement,
	updateStatementTop,
	deleteSubscribedStatement,
	setStatementOrder,
	setScreen,
	setStatementElementHight,
	setMembership,
	removeMembership,
	resetStatements,
	setCurrentMultiStepOptions,
	setMassConsensusStatements,
	updateStoreResultsSettings,
} = statementsSlice.actions;

// statements
export const totalMessageBoxesSelector = (state: { statements: StatementsState }) =>
	state.statements.statements.length;

export const screenSelector = (state: { statements: StatementsState }) => state.statements.screen;

export const statementSelectorById =
	(statementId: string | undefined) => (state: { statements: StatementsState }) => {
		return state.statements.statements.find((statement) => statement.statementId === statementId);
	};

export const statementsSelector = (state: { statements: StatementsState }) =>
	state.statements.statements;

// Memoized selector for statement by ID - use when you need to subscribe to updates
export const makeStatementByIdSelector = createStatementByIdSelector(statementsSelector);

const selectFilteredStatements = createFilteredStatementsSelector(statementsSelector);
export const subStatementsByTopParentIdMemo = (statementId: string | undefined) =>
	selectFilteredStatements(
		(statement) =>
			statement.topParentId === statementId && statement.statementType !== StatementType.document,
	);

export const statementDescendantsSelector = (statementId: string) =>
	createSelector(
		(state: { statements: StatementsState }) => state.statements.statements,
		(statements) => statements.filter((statement) => statement.parents?.includes(statementId)),
	);

export const statementsRoomSolutions =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statements
			.filter(
				(statement) =>
					statement.parentId === statementId && statement.statementType === StatementType.option,
			)
			.sort((a, b) => a.createdAt - b.createdAt);

export const statementsSubscriptionsSelector = createSelector(
	(state: { statements: StatementsState }) => state.statements.statementSubscription,
	(statementSubscription) => [...statementSubscription].sort((a, b) => b.lastUpdate - a.lastUpdate),
);
export const statementSelector =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statements.find((statement) => statement.statementId === statementId);

export const topSubscriptionsSelector = createSelector(
	(state: { statements: StatementsState }) => state.statements.statementSubscription,
	(statementSubscription) =>
		statementSubscription
			.filter((sub: StatementSubscription) => sub.statement.parentId === 'top')
			.sort((a, b) => b.lastUpdate - a.lastUpdate),
);

const selectStatements = (state: { statements: StatementsState }) => state.statements.statements;

// Memoized selector - removed .map() that was breaking memoization
const selectStatementsByParent = createStatementsByParentSelector(selectStatements);
export const statementSubsSelector = selectStatementsByParent;

// Memoized selector - removed .map() that was breaking memoization
const selectStatementsByParentAndType = createStatementsByParentAndTypeSelector(statementsSelector);
export const statementOptionsSelector = (statementId: string | undefined) =>
	selectStatementsByParentAndType(statementId, StatementType.option);

export const questionsSelector =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statements
			.filter(
				(statement) =>
					statement.parentId === statementId && statement.statementType === StatementType.question,
			)
			.sort((a, b) => a.createdAt - b.createdAt);

export const statementSubscriptionSelector =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statementSubscription.find(
			(statementSub) => statementSub.statementId === statementId,
		) || undefined;
export const statementOrderSelector =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statements.find((statement) => statement.statementId === statementId)?.order ||
		0;
export const statementElementHightSelector =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statements.find((statement) => statement.statementId === statementId)
			?.elementHight || 0;
export const lastUpdateStatementSubscriptionSelector = (state: { statements: StatementsState }) =>
	state.statements.statementSubscriptionLastUpdate;

// Membership
export const statementMembershipSelector =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statementMembership.filter(
			(statement: StatementSubscription) => statement.statementId === statementId,
		);

export const hasTokenSelector =
	(token: string, statementId: string | undefined) => (state: { statements: StatementsState }) => {
		const subscription = state.statements.statementSubscription.find(
			(statement) => statement.statementId === statementId,
		);

		return subscription?.tokens?.includes(token) || false;
	};

export const subscriptionParentStatementSelector = (parentId: string) =>
	createSelector(
		(state: { statements: StatementsState }) => state.statements.statementSubscription,
		(statementSubscription) =>
			statementSubscription.filter((sub) => sub.statement.topParentId === parentId),
	);

const selectMultiStepFiltered = createFilteredStatementsSelector(statementsSelector);
export const statementsOfMultiStepSelectorByStatementId = (statementId: string | undefined) =>
	selectMultiStepFiltered((st) => st.isInMultiStage === true && st.parentId === statementId);

const selectUserSuggestionsFiltered = createFilteredStatementsSelector(statementsSelector);
export const userSuggestionsSelector = (parentId: string | undefined, userId: string | undefined) =>
	selectUserSuggestionsFiltered(
		(statement) =>
			statement.parentId === parentId &&
			statement.creatorId === userId &&
			statement.statementType === StatementType.option,
		sortByCreatedAt,
	);

export default statementsSlice.reducer;
