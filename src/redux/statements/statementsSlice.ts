import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { Statement, StatementSubscription, SelectionFunction, StatementType, updateArray, ResultsSettings } from 'delib-npm';

enum StatementScreen {
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

export const statementsSlicer = createSlice({
	name: 'statements',
	initialState,
	reducers: {
		setStatement: (state, action: PayloadAction<Statement>) => {
			try {
				const newStatement = { ...action.payload };

				//for legacy statements - can be deleted after all statements are updated or at least after 1 feb 24.
				if (!Array.isArray(newStatement.results))
					newStatement.results = [];

				newStatement.order = 0;
				const oldStatement = state.statements.find(
					(statement) =>
						statement.statementId === newStatement.statementId
				);

				const isEqualStatements =
					JSON.stringify(oldStatement) ===
					JSON.stringify(newStatement);
				if (!isEqualStatements)
					state.statements = updateArray(
						state.statements,
						action.payload,
						'statementId'
					);

				//update last update if bigger than current
				if (
					newStatement.lastUpdate >
					state.statementSubscriptionLastUpdate
				) {
					state.statementSubscriptionLastUpdate =
						newStatement.lastUpdate;
				}
			} catch (error) {
				console.error(error);
			}
		},
		setMassConsensusStatements: (
			state,
			action: PayloadAction<{
				statements: Statement[];
				selectionFunction: SelectionFunction;
			}>
		) => {
			const statements = action.payload.statements.map(
				(st: Statement) => ({
					...st,
					evaluation: {
						sumEvaluations: st.evaluation?.sumEvaluations ?? 0,
						agreement: st.evaluation?.agreement ?? 0,
						numberOfEvaluators: st.evaluation?.numberOfEvaluators ?? 0,
						sumPro: st.evaluation?.sumPro ?? 0,
						sumCon: st.evaluation?.sumCon ?? 0,
						viewed: st.evaluation?.viewed ?? 0,
						evaluationRandomNumber: st.evaluation?.evaluationRandomNumber,
						selectionFunction: action.payload.selectionFunction,
					},
				})
			);

			const previousSelectedStatements: Statement[] = state.statements
				.filter(
					(st) =>
						st.evaluation?.selectionFunction ===
						action.payload.selectionFunction
				)
				.map((st) => ({
					...st,
					evaluation: {
						...st.evaluation,
						selectionFunction: undefined,
					},
				}));

			previousSelectedStatements.forEach((st) => {
				state.statements = updateArray(
					state.statements,
					st,
					'statementId'
				);
			});
			statements.forEach((st) => {
				state.statements = updateArray(
					state.statements,
					st,
					'statementId'
				);
			});
		},
		setStatements: (state, action: PayloadAction<Statement[]>) => {
			try {
				const statements = action.payload;

				statements.forEach((statement) => {
					state.statements = updateArray(
						state.statements,
						statement,
						'statementId'
					);
				});
			} catch (error) {
				console.error(error);
			}
		},
		deleteStatement: (state, action: PayloadAction<string>) => {
			try {
				const statementId = action.payload;

				state.statements = state.statements.filter(
					(statement) => statement.statementId !== statementId
				);
			} catch (error) {
				console.error(error);
			}
		},
		setStatementSubscription: (
			state,
			action: PayloadAction<StatementSubscription>
		) => {
			try {
				const newStatementSubscription = action.payload;
				const index = state.statementSubscription.findIndex(
					(statement) =>
						statement.statementId ===
						newStatementSubscription.statementId
				);

				if (
					index === -1 ||
					JSON.stringify(state.statementSubscription[index]) !==
					JSON.stringify(newStatementSubscription)
				) {
					state.statementSubscription = updateArray(
						state.statementSubscription,
						newStatementSubscription,
						'statementsSubscribeId'
					);
				}
				state.statementSubscription = updateArray(
					state.statementSubscription,
					newStatementSubscription,
					'statementId'
				);

				//update last update if bigger than current
				if (
					newStatementSubscription.lastUpdate >
					state.statementSubscriptionLastUpdate
				) {
					state.statementSubscriptionLastUpdate =
						newStatementSubscription.lastUpdate;
				}
			} catch (error) {
				console.error(error);
			}
		},
		setStatementsSubscription: (
			state,
			action: PayloadAction<StatementSubscription[]>
		) => {
			try {
				const newStatements = action.payload;

				newStatements.forEach((statement) => {
					state.statementSubscription = updateArray(
						state.statementSubscription,
						statement,
						'statementsSubscribeId'
					);
				});
			} catch (error) {
				console.error(error);
			}
		},
		deleteSubscribedStatement: (state, action: PayloadAction<string>) => {
			try {
				const statementId = action.payload;

				state.statementSubscription =
					state.statementSubscription.filter(
						(statement) => statement.statementId !== statementId
					);
			} catch (error) {
				console.error(error);
			}
		},
		setStatementOrder: (state, action: PayloadAction<StatementOrder>) => {
			try {
				const { statementId, order } = action.payload;
				const statement = state.statements.find(
					(statement) => statement.statementId === statementId
				);
				if (statement) statement.order = order;
			} catch (error) {
				console.error(error);
			}
		},
		setStatementElementHight: (
			state,
			action: PayloadAction<{
				statementId: string;
				height: number | undefined;
			}>
		) => {
			try {
				const { statementId, height } = action.payload;
				const statement = state.statements.find(
					(statement) => statement.statementId === statementId
				);
				if (statement) statement.elementHight = height;
			} catch (error) {
				console.error(error);
			}
		},
		updateStatementTop: (
			state,
			action: PayloadAction<{ statementId: string; top: number }[]>
		) => {
			try {
				const updates = action.payload;
				updates.forEach((update) => {
					try {
						const statement = state.statements.find(
							(statement) =>
								statement.statementId === update.statementId
						);
						if (statement) statement.top = update.top;
						else
							throw new Error(
								`statement ${update.statementId} not found`
							);
					} catch (error) {
						console.error('On updateStatementTop loop: ', error);
					}
				});
			} catch (error) {
				console.error(error);
			}
		},
		setScreen: (state, action: PayloadAction<StatementScreen>) => {
			try {
				state.screen = action.payload;
			} catch (error) {
				console.error(error);
			}
		},

		setMembership: (
			state,
			action: PayloadAction<StatementSubscription>
		) => {
			try {
				const newMembership = action.payload;

				state.statementMembership = updateArray(
					state.statementMembership,
					newMembership,
					'statementsSubscribeId'
				);
			} catch (error) {
				console.error(error);
			}
		},
		removeMembership: (state, action: PayloadAction<string>) => {
			try {
				const statementsSubscribeId = action.payload;
				state.statementMembership = state.statementMembership.filter(
					(statement) =>
						statement.statementsSubscribeId !==
						statementsSubscribeId
				);
			} catch (error) {
				console.error(error);
			}
		},
		resetStatements: (state) => {
			state.statements = [];
			state.statementSubscription = [];
			state.statementSubscriptionLastUpdate = 0;
			state.statementMembership = [];
			state.screen = StatementScreen.chat;
		},
		setCurrentMultiStepOptions: (
			state,
			action: PayloadAction<Statement[]>
		) => {
			try {
				const previousInMultiStageOptions = state.statements.filter(
					(statement) => statement.isInMultiStage
				);
				previousInMultiStageOptions.forEach((statement) => {
					statement.isInMultiStage = false;
				});

				const newStatements = action.payload;
				newStatements.forEach((statement) => {
					statement.isInMultiStage = true;
					state.statements = updateArray(
						state.statements,
						statement,
						'statementId'
					);
				});
			} catch (error) {
				console.error(error);
			}
		},
		updateStoreResultsSettings: (state, action: PayloadAction<UpdateResultsSettings>) => {
			const { statementId, resultsSettings } = action.payload;
			const statement = state.statements.find(
				(statement) => statement.statementId === statementId
			);
			if (statement) {
				statement.resultsSettings = resultsSettings;
			}
		}
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
	updateStoreResultsSettings
} = statementsSlicer.actions;

// statements
export const totalMessageBoxesSelector = (state: RootState) =>
	state.statements.statements.length;

export const screenSelector = (state: RootState) => state.statements.screen;

export const statementSelectorById =
	(statementId: string | undefined) => (state: RootState) => {
		return state.statements.statements.find(
			(statement) => statement.statementId === statementId
		);
	};

export const statementsSelector = (state: RootState) =>
	state.statements.statements;

export const subStatementsByTopParentIdMemo = (
	statementId: string | undefined
) =>
	createSelector([statementsSelector], (statements) =>
		statements.filter(
			(statement) =>
				statement.topParentId === statementId &&
				statement.statementType !== StatementType.document
		)
	);

export const statementDescendantsSelector = (statementId: string) =>
	createSelector(
		(state: RootState) => state.statements.statements,
		(statements) =>
			statements.filter((statement) =>
				statement.parents?.includes(statementId)
			)
	);

export const statementsRoomSolutions =
	(statementId: string | undefined) => (state: RootState) =>
		state.statements.statements
			.filter(
				(statement) =>
					statement.parentId === statementId &&
					statement.statementType === StatementType.option
			)
			.sort((a, b) => a.createdAt - b.createdAt);

export const statementsSubscriptionsSelector = (
	state: RootState
): StatementSubscription[] => state.statements.statementSubscription;
export const statementSelector =
	(statementId: string | undefined) => (state: RootState) =>
		state.statements.statements.find(
			(statement) => statement.statementId === statementId
		);

export const topSubscriptionsSelector = createSelector(
	(state: RootState) => state.statements.statementSubscription,
	(statementSubscription) =>
		statementSubscription.filter(
			(sub: StatementSubscription) => sub.statement.parentId === 'top'
		)
);

const selectStatements = (state: RootState) => state.statements.statements;

export const statementSubsSelector = (statementId: string | undefined) =>
	createSelector([selectStatements], (statements) =>
		statements
			.filter((statementSub) => statementSub.parentId === statementId)
			.sort((a, b) => a.createdAt - b.createdAt)
			.map((statement) => ({ ...statement }))
	);

export const statementOptionsSelector = (statementId: string | undefined) =>
	createSelector([statementsSelector], (statements) => {
		const subStatements = statements
			.filter(
				(statementSub) =>
					statementSub.parentId === statementId &&
					statementSub.statementType === StatementType.option
			)
			.sort((a, b) => a.createdAt - b.createdAt)
			.map((statement) => ({ ...statement }));

		return subStatements;
	});

export const questionsSelector =
	(statementId: string | undefined) => (state: RootState) =>
		state.statements.statements
			.filter(
				(statement) =>
					statement.parentId === statementId &&
					statement.statementType === StatementType.question
			)
			.sort((a, b) => a.createdAt - b.createdAt);

export const statementSubscriptionSelector =
	(statementId: string | undefined) => (state: RootState) =>
		state.statements.statementSubscription.find(
			(statementSub) => statementSub.statementId === statementId
		) || undefined;
export const statementOrderSelector =
	(statementId: string | undefined) => (state: RootState) =>
		state.statements.statements.find(
			(statement) => statement.statementId === statementId
		)?.order || 0;
export const statementElementHightSelector =
	(statementId: string | undefined) => (state: RootState) =>
		state.statements.statements.find(
			(statement) => statement.statementId === statementId
		)?.elementHight || 0;
export const lastUpdateStatementSubscriptionSelector = (state: RootState) =>
	state.statements.statementSubscriptionLastUpdate;

// Membership
export const statementMembershipSelector =
	(statementId: string | undefined) => (state: RootState) =>
		state.statements.statementMembership.filter(
			(statement: StatementSubscription) =>
				statement.statementId === statementId
		);

export const hasTokenSelector =
	(token: string, statementId: string | undefined) => (state: RootState) => {
		const subscription = state.statements.statementSubscription.find(
			(statement) => statement.statementId === statementId
		);

		return subscription?.tokens?.includes(token) || false;
	};

export const subscriptionParentStatementSelector = (parentId: string) =>
	createSelector(
		(state: RootState) => state.statements.statementSubscription,
		(statementSubscription) =>
			statementSubscription.filter(
				(sub) => sub.statement.topParentId === parentId
			)
	);

export const statementsOfMultiStepSelectorByStatementId = (
	statementId: string | undefined
) =>
	createSelector(
		(state: RootState) => state.statements.statements,
		(statements) =>
			statements.filter(
				(st) => st.isInMultiStage && st.parentId === statementId
			)
	);

export default statementsSlicer.reducer;
