import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
	Statement,
	StatementSubscription,
	SelectionFunction,
	updateArray,
	ResultsSettings,
} from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

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

// Re-export selectors for backward compatibility
export {
	totalMessageBoxesSelector,
	screenSelector,
	statementSelectorById,
	statementsSelector,
	makeStatementByIdSelector,
	subStatementsByTopParentIdMemo,
	statementDescendantsSelector,
	statementsRoomSolutions,
	statementsSubscriptionsSelector,
	statementSelector,
	topSubscriptionsSelector,
	statementSubsSelector,
	statementOptionsSelector,
	questionsSelector,
	statementSubscriptionSelector,
	statementOrderSelector,
	statementElementHightSelector,
	lastUpdateStatementSubscriptionSelector,
	statementMembershipSelector,
	hasTokenSelector,
	subscriptionParentStatementSelector,
	statementsOfMultiStepSelectorByStatementId,
	userSuggestionsSelector,
} from './statementsSelectors';

export default statementsSlice.reducer;
